// Native replay fixtures and orchestration; credentials exist only in RAM.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const { createRequire } = require('node:module')
const { setTimeout: delay } = require('node:timers/promises')
const { createUserAccountWorkflow } = require('@medusajs/medusa/core-flows')
const storefrontRequire = createRequire(resolve(__dirname, '../../storefront/package.json'))
const Medusa = storefrontRequire('@medusajs/js-sdk').default

exports.default = async function loyaltyLive({ container }) {
  const config = container.resolve('configModule')
  const database = new URL(config.projectConfig.databaseUrl)
  assert.equal(process.env.RIGBY_REPLAY, '1')
  assert.equal(database.pathname, '/rigby_medusa_replay')
  assert.equal(database.port, '5433')
  const backendOrigin = 'http://127.0.0.1:9100'
  const origin = 'http://127.0.0.1:3100'
  const query = container.resolve('query')
  const { data: keys } = await query.graph({
    entity: 'api_key', fields: ['token'], filters: { type: 'publishable', revoked_at: null },
  })
  let publicSdk
  for (let attempt = 0; attempt < 100 && !publicSdk; attempt++) {
    for (const key of keys) {
      const candidate = new Medusa({ baseUrl: backendOrigin, publishableKey: key.token, auth: { type: 'jwt', jwtTokenStorageMethod: 'memory' } })
      try {
        if ((await candidate.store.product.list({ limit: 1 })).products.length) { publicSdk = candidate; break }
      } catch { /* A development watcher may be restarting; no key is logged. */ }
    }
    if (!publicSdk) await delay(200)
  }
  assert.ok(publicSdk, 'Replay backend and an existing catalog key must be available')
  const { regions } = await publicSdk.store.region.list()
  const region = regions.find(item => item.currency_code === 'eur')
  assert.ok(region, 'Existing EUR region')
  const { payment_providers: providers } = await publicSdk.store.payment.listPaymentProviders({ region_id: region.id })
  assert.ok(providers.some(provider => provider.id === 'pp_system_default'), 'System provider enabled')
  const { products } = await publicSdk.store.product.list({ region_id: region.id, fields: '+variants.calculated_price', limit: 100 })
  const product = products.find(item => item.variants?.some(variant => Number(variant.calculated_price?.calculated_amount) > 0))
  assert.ok(product, 'Existing priced product')
  const variant = product.variants.find(item => Number(item.calculated_price?.calculated_amount) > 0)
  const price = Number(variant.calculated_price.calculated_amount)
  const countryCode = region.countries?.[0]?.iso_2
  assert.ok(countryCode, 'EUR region country')

  async function createCustomer(label) {
    const email = `loyalty-${label}-${randomUUID()}@example.test`
    const password = randomUUID() + randomUUID()
    const sdk = new Medusa({ baseUrl: backendOrigin, publishableKey: process.env.NUXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, auth: { type: 'jwt', jwtTokenStorageMethod: 'memory' } })
    await sdk.auth.register('customer', 'emailpass', { email, password })
    const { customer } = await sdk.store.customer.create({ email, first_name: 'Loyalty', last_name: 'Replay' })
    const token = await sdk.auth.login('customer', 'emailpass', { email, password })
    assert.equal(typeof token, 'string')
    return { id: customer.id, email, password, sdk, token }
  }
  const customer = await createCustomer('browser')
  const admin = { email: `loyalty-admin-${randomUUID()}@example.test`, password: randomUUID() + randomUUID() }
  const registered = await container.resolve('auth').register('emailpass', { body: admin })
  assert.ok(registered.success && registered.authIdentity, 'Native replay admin auth identity')
  await createUserAccountWorkflow(container).run({
    input: { authIdentityId: registered.authIdentity.id, userData: { email: admin.email, first_name: 'Loyalty Replay' } },
  })
  const adminSdk = new Medusa({ baseUrl: backendOrigin, auth: { type: 'jwt', jwtTokenStorageMethod: 'memory' } })
  await adminSdk.auth.login('user', 'emailpass', admin)
  const inspectOrder = async id => {
    const { data: orders } = await query.graph({
      entity: 'order',
      fields: ['id', 'customer_id', 'currency_code', 'item_total', 'shipping_total', 'total', 'items.*', 'payment_collections.*', 'payment_collections.payments.*', 'payment_collections.payments.captures.*'],
      filters: { id },
    })
    assert.ok(orders[0], 'Native persisted order exists')
    return orders[0]
  }
  const fixture = {
    origin, backendOrigin, customer, admin,
    product: { handle: product.handle, variantId: variant.id },
    countryCode,
    firstQuantity: Math.ceil(100 / price),
    secondQuantity: Math.max(1, Math.ceil(20 / price)),
    inspectOrder,
  }
  console.log(JSON.stringify({ phase: 'native-replay-fixtures', customerId: customer.id, regionId: region.id, variantId: variant.id, countryCode, firstQuantity: fixture.firstQuantity, unitPrice: price, passed: true }))
  const browserModule = await import(pathToFileURL(resolve(process.cwd(), '../../scripts/loyalty-browser.mjs')).href)
  const browser = await browserModule.runLoyaltyBrowserTests(fixture)
  console.log(JSON.stringify({ phase: 'loyalty-browser-e2e', ...browser, passed: true }))
  // Query the module in this independent Medusa process, not browser memory.
  const balance = await container.resolve('loyalty').getPoints(customer.id)
  assert.equal(balance, browser.finalBalance, 'Independent-process persisted final balance')
  console.log(JSON.stringify({ phase: 'independent-process-balance', customerId: customer.id, balance, passed: true }))

  if (process.env.LOYALTY_FAILURE_TESTS === '1') {
    const funded = await createCustomer('failure')
    const concurrentCustomer = await createCustomer('concurrent')
    const raceCustomer = await createCustomer('race')
    const stranger = await createCustomer('stranger')
    const createCart = async (owner, quantity = fixture.firstQuantity) => {
      const { cart } = await owner.sdk.store.cart.create({ region_id: region.id, items: [{ variant_id: variant.id, quantity }] })
      await owner.sdk.store.cart.update(cart.id, {
        email: owner.email,
        shipping_address: { first_name: 'Replay', last_name: 'Customer', address_1: 'Test Street 1', city: 'Test City', postal_code: '12345', country_code: countryCode },
      })
      const { shipping_options } = await owner.sdk.store.fulfillment.listCartOptions({ cart_id: cart.id })
      assert.ok(shipping_options.length, 'Actual shipping option for replay cart')
      await owner.sdk.store.cart.addShippingMethod(cart.id, { option_id: shipping_options[0].id })
      return (await owner.sdk.store.cart.retrieve(cart.id)).cart
    }
    let fundedPaymentId
    let fundedOrderId
    for (const owner of [funded, concurrentCustomer, raceCustomer]) {
      const fundCart = await createCart(owner)
      await owner.sdk.store.payment.initiatePaymentSession(fundCart, { provider_id: 'pp_system_default' })
      const placed = await owner.sdk.store.cart.complete(fundCart.id)
      assert.equal(placed.type, 'order')
      const fundOrder = await inspectOrder(placed.order.id)
      const paymentId = fundOrder.payment_collections.flatMap(collection => collection.payments)[0].id
      await adminSdk.admin.payment.capture(paymentId, {})
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await container.resolve('loyalty').getPoints(owner.id) >= 100) break
        await delay(100)
      }
      if (owner === funded) { fundedPaymentId = paymentId; fundedOrderId = placed.order.id }
    }
    const failAuthorization = async (cartId, onAuthorize) => {
      const provider = container.resolve('payment').paymentProviderService_.retrieveProvider('pp_system_default')
      const original = provider.authorizePayment
      provider.authorizePayment = async () => {
        await onAuthorize()
        throw new Error('Simulated System payment authorization failure')
      }
      try {
        const { completeCartWorkflow } = require('@medusajs/medusa/core-flows')
        return await completeCartWorkflow(container).run({ input: { id: cartId } })
      } finally { provider.authorizePayment = original }
    }
    const replayCapture = async () => {
      const loyalty = container.resolve('loyalty')
      const original = loyalty.changePoints
      let resolveReceipt
      let timer
      const observed = new Promise((resolveObserved, reject) => {
        resolveReceipt = resolveObserved
        timer = setTimeout(() => reject(new Error('Duplicate capture subscriber did not finish')), 15000)
      })
      loyalty.changePoints = async function (input, ...args) {
        const receipt = await original.call(this, input, ...args)
        if (input.operation_key === `earn:${fundedOrderId}`) resolveReceipt(receipt)
        return receipt
      }
      try {
        await container.resolve('event_bus').emit({ name: 'payment.captured', data: { id: fundedPaymentId } })
        const receipt = await observed
        assert.equal(receipt.applied, false, 'Actual duplicate-event subscriber reused the award receipt')
      } finally { clearTimeout(timer); loyalty.changePoints = original }
    }
    const { runLoyaltyLiveTests } = require('../integration-tests/live/loyalty')
    const tests = await runLoyaltyLiveTests({
      container, customer: funded, stranger, concurrentCustomer,
      raceCustomer, inspectOrder,
      origin: backendOrigin, publishableKey: process.env.NUXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
      regionId: region.id, variantId: variant.id, countryCode,
      quantity: fixture.secondQuantity, failAuthorization, replayCapture,
    })
    console.log(JSON.stringify({ phase: 'loyalty-live-failure-boundaries', ...tests, passed: true }))
  }
}
