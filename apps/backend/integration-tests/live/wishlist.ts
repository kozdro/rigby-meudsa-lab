import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

type Product = { id: string, title: string, handle: string | null, thumbnail: string | null }
type WishlistResponse = {
  wishlist: null | { id: string, items: { id: string, product_id: string, product: Product | null }[] }
}

export type WishlistLiveOptions = { origin: string, publishableKey: string, productId: string }

// A live HTTP exercise against the existing Rigby instance. It never invokes
// Medusa's disposable-database runner, resets data or changes catalog records.
// Credentials and tokens are returned only in memory for browser/restart checks.
export async function runWishlistLiveTests(options: WishlistLiveOptions) {
  const { origin, publishableKey, productId } = options
  let assertions = 0
  function check(condition: unknown, label: string): asserts condition {
    assert.ok(condition, label)
    assertions++
  }
  async function request(path: string, method = 'GET', token?: string, body?: unknown) {
    const response = await fetch(new URL(path, origin), {
      method,
      headers: {
        'x-publishable-api-key': publishableKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, body: await response.json() }
  }
  async function customer() {
    const email = `wishlist-${randomUUID()}@example.test`
    const password = `Rigby-${randomUUID()}`
    const registered = await request('/auth/customer/emailpass/register', 'POST', undefined, { email, password })
    check(registered.status === 200 && typeof registered.body.token === 'string', 'Native customer auth registration')
    const created = await request('/store/customers', 'POST', registered.body.token, { email, first_name: 'Wishlist test' })
    check(created.status === 200, 'Native customer creation')
    const login = await request('/auth/customer/emailpass', 'POST', undefined, { email, password })
    check(login.status === 200 && typeof login.body.token === 'string', 'Native customer login')
    return { email, password, token: login.body.token as string, customerId: created.body.customer.id as string }
  }

  for (const [path, method, body] of [
    ['/store/wishlist', 'GET', undefined],
    ['/store/wishlist/items', 'POST', { product_id: productId }],
    [`/store/wishlist/items/${productId}`, 'DELETE', undefined],
  ] as const) {
    check((await request(path, method, undefined, body)).status === 401, `Anonymous ${method} rejected`)
  }
  const [alice, bob] = await Promise.all([customer(), customer()])
  check((await request('/store/wishlist', 'GET', alice.token)).body.wishlist === null, 'GET does not create wishlist')
  check((await request(`/store/wishlist/items/${productId}`, 'DELETE', alice.token)).body.wishlist === null, 'Delete before first add is idempotent')
  for (const body of [
    { product_id: ' ' }, {}, { product_id: productId, customer_id: bob.customerId },
    { product_id: productId, wishlist_id: 'spoofed' },
  ]) {
    check((await request('/store/wishlist/items', 'POST', alice.token, body)).status === 400, 'Invalid or ownership-bearing body rejected')
  }
  check((await request('/store/wishlist/items', 'POST', alice.token, { product_id: 'prod_wishlist_unknown' })).status === 404, 'Unknown product rejected')
  check((await request('/store/wishlist', 'GET', alice.token)).body.wishlist === null, 'Rejected add creates no wishlist')

  const adds = await Promise.all(Array.from({ length: 8 }, () => request('/store/wishlist/items', 'POST', alice.token, { product_id: productId })))
  check(adds.every((result) => result.status === 200), 'Concurrent first additions all succeed')
  const saved = (await request('/store/wishlist', 'GET', alice.token)).body as WishlistResponse
  check(saved.wishlist?.items.length === 1, 'Concurrent additions persist one unique item')
  check(saved.wishlist?.items[0]?.product?.id === productId, 'Saved product details returned')
  const wishlistId = saved.wishlist!.id
  check((await request(`/store/wishlist?customer_id=${alice.customerId}&wishlist_id=${wishlistId}`, 'GET', bob.token)).body.wishlist === null, 'Owner query cannot expose another customer wishlist')
  await request(`/store/wishlist/items/${productId}?customer_id=${alice.customerId}`, 'DELETE', bob.token)
  check((await request('/store/wishlist', 'GET', alice.token)).body.wishlist.items.length === 1, 'Other customer delete cannot change owner data')
  const bobAdded = await request('/store/wishlist/items', 'POST', bob.token, { product_id: productId })
  check(bobAdded.status === 200 && bobAdded.body.wishlist.id !== wishlistId, 'Two customers own different wishlists')
  const removed = await request(`/store/wishlist/items/${productId}`, 'DELETE', alice.token)
  check(removed.status === 200 && removed.body.wishlist.items.length === 0, 'Owner removes saved product')
  check((await request(`/store/wishlist/items/${productId}`, 'DELETE', alice.token)).status === 200, 'Repeated delete succeeds')
  check((await request('/store/wishlist', 'GET', bob.token)).body.wishlist.items.length === 1, 'Owner delete does not affect second customer')
  const readded = await request('/store/wishlist/items', 'POST', alice.token, { product_id: productId })
  check(readded.status === 200 && readded.body.wishlist.items.length === 1, 'Add after removal succeeds')
  const relogin = await request('/auth/customer/emailpass', 'POST', undefined, { email: alice.email, password: alice.password })
  const persisted = await request('/store/wishlist', 'GET', relogin.body.token)
  check(persisted.body.wishlist.id === wishlistId && persisted.body.wishlist.items.length === 1, 'Saved state persists across fresh login and retrieval')

  return { assertions, alice, bob, wishlistId, productId }
}
