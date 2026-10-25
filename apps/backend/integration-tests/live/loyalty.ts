import assert from 'node:assert/strict'
import type { HttpTypes, MedusaContainer } from '@medusajs/framework/types'
import { setTimeout as delay } from 'node:timers/promises'
import { completeCartWorkflow } from '@medusajs/medusa/core-flows'
import LoyaltyModuleService from '../../src/modules/loyalty/service'
import { applyLoyaltyOnCartWorkflow, removeLoyaltyFromCartWorkflow } from '../../src/workflows/loyalty/cart'

type Customer = { id: string; email: string; token: string }
type NativeBody = {
  cart?: HttpTypes.StoreCart
  order?: HttpTypes.StoreOrder
  type?: string
  points?: number
  payment_collection?: { id: string }
  shipping_options?: { id: string }[]
}

// Workflow errors may be deserialized plain objects rather than Error instances.
// Report only their bounded error text, never workflow inputs or container data.
function workflowErrorText(error: unknown, depth = 0): string {
  if (depth > 4 || error === null || error === undefined) return ''
  if (typeof error === 'string') return error.slice(0, 500)
  if (Array.isArray(error)) return error.map(value => workflowErrorText(value, depth + 1)).filter(Boolean).join('; ')
  if (typeof error !== 'object') return String(error)
  const record = error as Record<string, unknown>
  return [
    ...['name', 'type', 'message'].map(key => typeof record[key] === 'string' ? String(record[key]).slice(0, 500) : ''),
    ...['error', 'cause', 'errors', 'thrownError'].map(key => workflowErrorText(record[key], depth + 1)),
  ].filter(Boolean).join(': ').replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[redacted-url]')
}

export type LoyaltyLiveOptions = {
  origin: string
  publishableKey: string
  regionId: string
  variantId: string
  countryCode: string
  quantity?: number
  customer: Customer
  stranger: Customer
  concurrentCustomer: Customer
  raceCustomer: Customer
  inspectOrder: (id: string) => Promise<HttpTypes.AdminOrder>
  container: MedusaContainer
  failAuthorization: (cartId: string, onAuthorize: () => Promise<void>) => Promise<unknown>
  replayCapture: () => Promise<void>
}

// Only genuine carts/orders and already-earned customer balances are exercised.
// The caller must verify replay DB identity before invoking this function.
export async function runLoyaltyLiveTests(options: LoyaltyLiveOptions) {
  const {
    origin, publishableKey, regionId, variantId, countryCode, quantity = 1,
    customer, stranger, concurrentCustomer, raceCustomer, inspectOrder, container, failAuthorization, replayCapture,
  } = options
  assert.equal(new URL(origin).port, '9100', 'Replay HTTP port required')
  const databaseUrl = container.resolve('configModule').projectConfig.databaseUrl
  assert.equal(typeof databaseUrl, 'string', 'Configured database target required')
  const target = new URL(databaseUrl!)
  assert.equal(target.pathname, '/rigby_medusa_replay', 'Verified replay database required')
  assert.equal(target.port, '5433', 'Verified local replay PostgreSQL required')
  const loyalty: LoyaltyModuleService = container.resolve('loyalty')
  const passed: string[] = []
  function check(condition: unknown, description: string): asserts condition {
    assert.ok(condition, description)
    passed.push(description)
  }
  async function request(path: string, method = 'GET', actor?: Customer, body?: unknown) {
    const response = await fetch(new URL(path, origin), {
      method,
      headers: {
        'x-publishable-api-key': publishableKey,
        ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, body: await response.json() as NativeBody }
  }
  const balance = async (actor: Customer) => {
    const response = await request('/store/customers/me/loyalty-points', 'GET', actor)
    check(response.status === 200 && Number.isSafeInteger(response.body.points), 'Authenticated balance is returned')
    return response.body.points!
  }
  async function createCart(actor: Customer) {
    const response = await request('/store/carts', 'POST', actor, {
      region_id: regionId,
      email: actor.email,
      items: [{ variant_id: variantId, quantity }],
      shipping_address: {
        first_name: 'Loyalty', last_name: 'Boundary', address_1: 'Test Street 1',
        city: countryCode === 'de' ? 'Berlin' : 'Copenhagen',
        postal_code: countryCode === 'de' ? '10115' : '1000', country_code: countryCode,
      },
    })
    check(response.status === 200 && Boolean(response.body.cart?.id), 'Native cart created')
    const id = response.body.cart!.id
    const shipping = await request(`/store/shipping-options?cart_id=${encodeURIComponent(id)}`, 'GET', actor)
    check(shipping.status === 200 && Boolean(shipping.body.shipping_options?.[0]?.id), 'Real eligible shipping option exists')
    const selected = await request(`/store/carts/${id}/shipping-methods`, 'POST', actor, {
      option_id: shipping.body.shipping_options![0].id,
    })
    check(selected.status === 200 && Boolean(selected.body.cart), 'Native shipping added')
    return selected.body.cart!
  }
  async function initializePayment(id: string, actor: Customer) {
    const current = await request(`/store/carts/${id}`, 'GET', actor)
    let collectionId = current.body.cart?.payment_collection?.id
    if (!collectionId) {
      const created = await request('/store/payment-collections', 'POST', actor, { cart_id: id })
      check(created.status === 200 && Boolean(created.body.payment_collection?.id), 'Native payment collection created')
      collectionId = created.body.payment_collection!.id
    }
    const session = await request(`/store/payment-collections/${collectionId}/payment-sessions`, 'POST', actor, {
      provider_id: 'pp_system_default',
    })
    check(session.status === 200, 'Native System payment session initialized after final cart totals')
  }
  const apply = (id: string, actor: Customer, points = 100) => request(`/store/carts/${id}/loyalty-points`, 'POST', actor, { points })
  const complete = (id: string, actor: Customer) => request(`/store/carts/${id}/complete`, 'POST', actor)

  const startingBalance = await balance(customer)
  const concurrentStartingBalance = await balance(concurrentCustomer)
  check(startingBalance >= 100 && startingBalance < 200, 'Failure-test customer has 100–199 points from a real captured order')
  check(concurrentStartingBalance >= 100 && concurrentStartingBalance < 200, 'Concurrency customer has 100–199 points from a real captured order')
  check(await balance(stranger) === 0, 'Unfunded stranger has zero points')
  check((await request('/store/customers/me/loyalty-points')).status === 401, 'Anonymous balance read rejected')
  const foreignCart = await createCart(stranger)
  for (const method of ['POST', 'DELETE']) {
    check((await request(`/store/carts/${foreignCart.id}/loyalty-points`, method, undefined, method === 'POST' ? { points: 100 } : undefined)).status === 401, `Anonymous ${method} loyalty rejected`)
    check((await request(`/store/carts/${foreignCart.id}/loyalty-points`, method, customer, method === 'POST' ? { points: 100 } : undefined)).status === 403, `Another customer's cart cannot be changed by ${method}`)
  }
  for (const invalid of [0, -100, 1, 99, 101, 100.5, 1e20, '100', null]) {
    check((await request(`/store/carts/${foreignCart.id}/loyalty-points`, 'POST', stranger, { points: invalid })).status === 400, 'Non-whole-block loyalty request rejected')
  }
  check((await apply(foreignCart.id, stranger)).status === 400, 'Insufficient loyalty balance rejected')
  check(await balance(stranger) === 0, 'Rejected attempts do not alter stranger balance')
  const pointsBeforeReplay = await balance(customer)
  await replayCapture()
  check(await balance(customer) === pointsBeforeReplay, 'Redelivered real capture event does not award twice')

  // A deliberate receipt NOT NULL failure happens after balance update inside
  // the module transaction. The database must roll back both changes together.
  await assert.rejects(() => loyalty.changePoints({
    customer_id: customer.id, operation_key: null as unknown as string, points: 1,
  }))
  check(await balance(customer) === startingBalance, 'Receipt insert failure rolls back the actual PostgreSQL balance update')

  const failureCart = await createCart(customer)
  const applied = await apply(failureCart.id, customer)
  check(applied.status === 200, 'Funded customer applies loyalty without spending')
  check(await balance(customer) === startingBalance, 'Applying leaves persisted points unchanged')
  const duplicateApply = await apply(failureCart.id, customer)
  check(duplicateApply.status === 409, 'Repeated apply cannot create a second active redemption')
  await initializePayment(failureCart.id, customer)
  let sawPostDebitAuthorization = false
  await assert.rejects(() => failAuthorization(failureCart.id, async () => {
    check(await balance(customer) === startingBalance - 100, 'Real payment-authorization failure is injected after the debit committed')
    sawPostDebitAuthorization = true
  }))
  check(sawPostDebitAuthorization, 'Failure test reached the actual external-payment boundary')
  check(await balance(customer) === startingBalance, 'Failed order completion restores the exact original balance')
  const [failedReceipt] = await loyalty.listLoyaltyEntries({ operation_key: `redeem:${failureCart.id}` })
  check(failedReceipt?.state === 'reversed', 'Failed completion persisted a reversed settlement receipt')
  const oldCompensation = { entry_id: failedReceipt.id, attempt_token: failedReceipt.attempt_token }
  await loyalty.reverseChange(oldCompensation)
  await loyalty.reverseChange(oldCompensation)
  check(await balance(customer) === startingBalance, 'Duplicate failure compensation never credits twice')
  await initializePayment(failureCart.id, customer)
  const retry = await complete(failureCart.id, customer)
  check(retry.status === 200 && retry.body.type === 'order' && Boolean(retry.body.order?.id), 'Failed cart retries into a real native order')
  check(await balance(customer) === startingBalance - 100, 'Successful retry consumes exactly one block')
  const successfulReceipt = await loyalty.retrieveLoyaltyEntry(failedReceipt.id)
  check(successfulReceipt.state === 'applied' && successfulReceipt.attempt_token !== failedReceipt.attempt_token, 'Retry uses the same receipt with a new compensation generation')
  await loyalty.reverseChange(oldCompensation)
  check(await balance(customer) === startingBalance - 100, 'Stale compensation cannot undo a newer successful retry')
  const repeated = await complete(failureCart.id, customer)
  check(repeated.status === 200 && repeated.body.type === 'order' && repeated.body.order?.id === retry.body.order!.id, 'Replayed successful completion returns the same order')
  check(await balance(customer) === startingBalance - 100, 'Replayed successful completion cannot spend again')
  check((await loyalty.listLoyaltyEntries({ operation_key: `redeem:${failureCart.id}` })).length === 1, 'Only one persistent settlement receipt exists for the cart')

  const staleCart = await createCart(concurrentCustomer)
  check((await apply(staleCart.id, concurrentCustomer)).status === 200, 'Stale-cart fixture has a native loyalty promotion')
  for (const item of staleCart.items ?? []) {
    check((await request(`/store/carts/${staleCart.id}/line-items/${item.id}`, 'DELETE', concurrentCustomer)).status === 200, 'Native product removal reprices the cart')
  }
  await initializePayment(staleCart.id, concurrentCustomer)
  const stale = await complete(staleCart.id, concurrentCustomer)
  check(stale.body.type !== 'order', 'A cart without eligible products cannot complete with a loyalty discount')
  check(await balance(concurrentCustomer) === concurrentStartingBalance, 'Stale product value failure does not consume points')

  const [one, two] = await Promise.all([createCart(concurrentCustomer), createCart(concurrentCustomer)])
  check((await apply(one.id, concurrentCustomer)).status === 200 && (await apply(two.id, concurrentCustomer)).status === 200, 'Two different carts may preview a discount without reserving points')
  check(await balance(concurrentCustomer) === concurrentStartingBalance, 'Both previews leave balance unchanged')
  await Promise.all([initializePayment(one.id, concurrentCustomer), initializePayment(two.id, concurrentCustomer)])
  const concurrent = await Promise.all([complete(one.id, concurrentCustomer), complete(two.id, concurrentCustomer)])
  const successes = concurrent.filter(value => value.body.type === 'order')
  check(successes.length === 1, 'Concurrent carts cannot both spend the same 100 points')
  check(concurrent.filter(value => value.body.type !== 'order').length === 1, 'Losing concurrent cart is rejected without an order')
  check(await balance(concurrentCustomer) === concurrentStartingBalance - 100, 'Concurrent settlement deducted exactly 100 points and never went negative')
  const winningIndex = concurrent.findIndex(value => value.body.type === 'order')
  const winningCart = [one, two][winningIndex]
  const winnerRetry = await complete(winningCart.id, concurrentCustomer)
  check(winnerRetry.body.order?.id === successes[0].body.order?.id, 'Concurrent winner retry returns the original order')
  check(await balance(concurrentCustomer) === concurrentStartingBalance - 100, 'Concurrent winner retry preserves the final balance')

  // Run both workflows in the same real Medusa container so that they use the
  // same lock provider. The external authorization gate changes no payment or
  // loyalty result: once released, it delegates to the real System provider.
  type SystemProvider = { authorizePayment: (...args: unknown[]) => Promise<unknown> }
  const payment = container.resolve('payment') as unknown as {
    paymentProviderService_: { retrieveProvider: (id: string) => SystemProvider }
  }
  const system = payment.paymentProviderService_.retrieveProvider('pp_system_default')
  async function completionRace(cartId: string, mutation: () => Promise<unknown>, description: string) {
    const originalAuthorize = system.authorizePayment
    let releaseAuthorization!: () => void
    let reachedAuthorization!: () => void
    const release = new Promise<void>(resolve => { releaseAuthorization = resolve })
    const reached = new Promise<void>(resolve => { reachedAuthorization = resolve })
    let completion: Promise<{ result: { id: string } }> | undefined
    let mutationResult: Promise<{ ok: boolean; error?: unknown }> | undefined
    let gateTimeout: ReturnType<typeof setTimeout> | undefined
    try {
      system.authorizePayment = async function (...args: unknown[]) {
        reachedAuthorization()
        await release
        return originalAuthorize.apply(this, args)
      }
      completion = completeCartWorkflow(container).run({ input: { id: cartId } })
      await Promise.race([
        reached,
        completion.then(() => { throw new Error('Completion returned before the real authorization gate') }),
        new Promise<never>((_resolve, reject) => {
          gateTimeout = setTimeout(() => reject(new Error('Real completion did not reach payment authorization gate')), 15000)
        }),
      ])
      let mutationSettled = false
      mutationResult = mutation().then(
        () => ({ ok: true }),
        error => ({ ok: false, error }),
      ).finally(() => { mutationSettled = true })
      await delay(250)
      check(!mutationSettled, `${description} waits while native completion holds the canonical cart lock`)
      releaseAuthorization()
      const completed = await completion
      const mutated = await mutationResult
      check(Boolean(completed.result.id), `${description} completion placed a real order`)
      const failure = workflowErrorText(mutated.error)
      check(!mutated.ok && /completed/i.test(failure),
        `${description} mutation rejects the now-completed cart (outcome=${mutated.ok ? 'resolved' : 'rejected'}, error=${failure || 'no error text'})`)
      return completed.result.id
    } finally {
      if (gateTimeout) clearTimeout(gateTimeout)
      releaseAuthorization()
      system.authorizePayment = originalAuthorize
      await Promise.allSettled([completion, mutationResult].filter(Boolean))
    }
  }
  const raceStartingBalance = await balance(raceCustomer)
  check(raceStartingBalance >= 100, 'Race customer starts with points earned from a real captured order')
  const undiscountedRaceCart = await createCart(raceCustomer)
  await initializePayment(undiscountedRaceCart.id, raceCustomer)
  const undiscountedRaceOrderId = await completionRace(
    undiscountedRaceCart.id,
    () => applyLoyaltyOnCartWorkflow(container).run({ input: { cart_id: undiscountedRaceCart.id, customer_id: raceCustomer.id, points: 100 } }),
    'Concurrent apply',
  )
  const undiscountedRaceOrder = await inspectOrder(undiscountedRaceOrderId)
  check(Math.abs(Number(undiscountedRaceOrder.total) - Number(undiscountedRaceCart.total)) < 0.01, 'Completing before apply preserves the undiscounted order snapshot')
  check(await balance(raceCustomer) === raceStartingBalance, 'Completing before apply spends no loyalty points')

  const discountedRaceCart = await createCart(raceCustomer)
  check((await apply(discountedRaceCart.id, raceCustomer)).status === 200, 'Race fixture applies a native product discount')
  const discountedRaceSnapshot = (await request(`/store/carts/${discountedRaceCart.id}`, 'GET', raceCustomer)).body.cart!
  await initializePayment(discountedRaceCart.id, raceCustomer)
  const discountedRaceOrderId = await completionRace(
    discountedRaceCart.id,
    () => removeLoyaltyFromCartWorkflow(container).run({ input: { cart_id: discountedRaceCart.id, customer_id: raceCustomer.id } }),
    'Concurrent remove',
  )
  const discountedRaceOrder = await inspectOrder(discountedRaceOrderId)
  check(Math.abs(Number(discountedRaceOrder.total) - Number(discountedRaceSnapshot.total)) < 0.01 &&
    Math.abs(Number(discountedRaceCart.total) - Number(discountedRaceOrder.total) - 10) < 0.01,
  'Completing before remove preserves the exact €10 discounted order snapshot')
  check(await balance(raceCustomer) === raceStartingBalance - 100, 'Completing before remove consumes exactly 100 points')

  return {
    assertions: passed.length, passed, retryOrderId: retry.body.order!.id,
    concurrentOrderId: successes[0].body.order!.id,
    undiscountedRaceOrderId, discountedRaceOrderId,
    customerFinalBalance: await balance(customer),
    concurrentFinalBalance: await balance(concurrentCustomer),
  }
}
