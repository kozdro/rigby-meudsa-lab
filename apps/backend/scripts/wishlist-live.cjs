const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { openSync, closeSync } = require('node:fs')
const { resolve } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { randomUUID } = require('node:crypto')
const { runWishlistLiveTests } = require('../integration-tests/live/wishlist')

// Run with `pnpm --dir apps/backend exec medusa exec ./scripts/wishlist-live.cjs`.
// Creates two uniquely named native customer accounts. Keeps credentials in RAM.
exports.default = async function wishlistLive({ container }) {
  const config = container.resolve('configModule')
  const target = new URL(config.projectConfig.databaseUrl)
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname))
  assert.equal(target.port, '5433')
  assert.equal(target.pathname, '/rigby_medusa')
  const query = container.resolve('query')
  const { data: keys } = await query.graph({
    entity: 'api_key', fields: ['token'], filters: { type: 'publishable', revoked_at: null },
  })
  const origin = 'http://localhost:9000'
  let backendReady = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${origin}/health`)).ok) { backendReady = true; break }
    } catch { /* Development watcher may be restarting after script edits. */ }
    await delay(200)
  }
  assert.ok(backendReady, 'Medusa HTTP server ready')
  let fixture
  for (const key of keys) {
    const response = await fetch(`${origin}/store/products?limit=1`, {
      headers: { 'x-publishable-api-key': key.token },
    })
    if (!response.ok) continue
    const body = await response.json()
    if (body.products?.length) {
      fixture = { origin, publishableKey: key.token, productId: body.products[0].id }
      break
    }
  }
  assert.ok(fixture, 'Existing published product and publishable key required; no catalog is seeded')
  const result = await runWishlistLiveTests(fixture)
  const wishlist = container.resolve('wishlist')
  await assert.rejects(() => wishlist.createWishlists({ customer_id: result.alice.customerId }))
  await assert.rejects(() => wishlist.createWishlistItems({ wishlist_id: result.wishlistId, product_id: result.productId }))
  const failedCustomer = `wishlist-rollback-${randomUUID()}`
  await assert.rejects(() => wishlist.insertItem(failedCustomer, null))
  assert.equal((await wishlist.listWishlists({ customer_id: failedCustomer })).length, 0)
  const { data: linked } = await query.graph({
    entity: 'wishlist', fields: ['id', 'customer.id', 'items.product.id'], filters: { id: result.wishlistId },
  })
  assert.equal(linked[0]?.customer?.id, result.alice.customerId)
  assert.equal(linked[0]?.items?.[0]?.product?.id, result.productId)
  console.log(JSON.stringify({ phase: 'live-http', assertions: result.assertions, databaseConstraintChecks: 2, moduleLinkChecks: 2, rollbackChecks: 2, passed: true }))

  const backendLog = openSync(resolve('.cache/wishlist-second-server.log'), 'w')
  const secondBackend = spawn('pnpm', ['exec', 'medusa', 'start', '--port', '9001'], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'development' },
    detached: true, stdio: ['ignore', backendLog, backendLog],
  })
  closeSync(backendLog)
  try {
    let secondReady = false
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        if ((await fetch('http://localhost:9001/health')).ok) { secondReady = true; break }
      } catch { /* Independent Medusa process is starting. */ }
      await delay(100)
    }
    assert.ok(secondReady, 'Independent Medusa HTTP process ready')
    const response = await fetch('http://localhost:9001/store/wishlist', {
      headers: { 'x-publishable-api-key': fixture.publishableKey, Authorization: `Bearer ${result.alice.token}` },
    })
    assert.equal(response.status, 200)
    const saved = await response.json()
    assert.equal(saved.wishlist.id, result.wishlistId)
    assert.equal(saved.wishlist.items[0].product_id, result.productId)
    console.log(JSON.stringify({ phase: 'independent-process-persistence', assertions: 4, passed: true }))
  } finally {
    if (secondBackend.pid) process.kill(-secondBackend.pid, 'SIGTERM')
  }

  const root = resolve(process.cwd(), '../..')
  const log = openSync(resolve('.cache/wishlist-nuxt.log'), 'w')
  const nuxt = spawn(process.execPath, ['apps/storefront/.output/server/index.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      NITRO_HOST: '127.0.0.1', NITRO_PORT: '3000',
      NUXT_PUBLIC_MEDUSA_BACKEND_URL: origin,
      NUXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: fixture.publishableKey,
    },
    stdio: ['ignore', log, log],
  })
  closeSync(log)
  try {
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await fetch('http://localhost:3000/api/customer/session')).ok) { ready = true; break }
      } catch { /* Nitro is starting. */ }
      await delay(100)
    }
    assert.ok(ready, 'Production Nuxt server ready')
    let bffAssertions = 0
    for (const [path, method, expected, requestOrigin, cookie] of [
      ['/api/wishlist', 'GET', 401],
      ['/api/wishlist/items', 'POST', 401, 'http://localhost:3000'],
      [`/api/wishlist/items/${result.productId}`, 'DELETE', 401, 'http://localhost:3000'],
      ['/api/customer/login', 'POST', 403, 'https://untrusted.example'],
      ['/api/customer/logout', 'POST', 403, 'https://untrusted.example'],
      ['/api/wishlist/items', 'POST', 403, 'https://untrusted.example'],
      [`/api/wishlist/items/${result.productId}`, 'DELETE', 403, 'https://untrusted.example'],
      ['/api/wishlist', 'GET', 401, undefined, 'rigby_customer_session=invalid-session'],
    ]) {
      const response = await fetch(`http://localhost:3000${path}`, {
        method,
        headers: {
          ...(requestOrigin ? { Origin: requestOrigin } : {}),
          ...(cookie ? { cookie } : {}),
          'Content-Type': 'application/json',
        },
        body: method === 'POST' ? JSON.stringify({ product_id: result.productId }) : undefined,
      })
      assert.equal(response.status, expected, `BFF ${method} ${path}`)
      bffAssertions++
    }
    const expiredSession = await fetch('http://localhost:3000/api/customer/session', {
      headers: { cookie: 'rigby_customer_session=invalid-session' },
    })
    assert.equal((await expiredSession.json()).customer, null)
    assert.ok(expiredSession.headers.get('set-cookie')?.includes('Max-Age=0'))
    bffAssertions += 2
    console.log(JSON.stringify({ phase: 'live-bff-security', assertions: bffAssertions, passed: true }))
    const { runWishlistBrowserTests } = await import('../../../scripts/wishlist-browser.mjs')
    const browser = await runWishlistBrowserTests({ origin: 'http://localhost:3000', ...result })
    console.log(JSON.stringify({ phase: 'chrome-browser', ...browser, passed: true }))
  } finally {
    nuxt.kill('SIGTERM')
  }
}
