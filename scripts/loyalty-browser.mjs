import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const evidence = fileURLToPath(new URL('../apps/storefront/.cache/loyalty/', import.meta.url))

// Actual Chrome and actual app requests. Authentication material stays in memory.
async function withLoyaltyBrowser(run) {
  await mkdir(evidence, { recursive: true })
  const profile = await mkdtemp(`${evidence}/chrome-`)
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--lang=en-US', '--no-first-run', '--disable-sync', '--disable-background-networking', 'about:blank',
  ], { stdio: 'ignore' })
  let socket
  try {
    let port
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        port = Number((await readFile(`${profile}/DevToolsActivePort`, 'utf8')).split('\n')[0])
        if (port) break
      } catch { /* Chrome is starting. */ }
      await delay(100)
    }
    assert.ok(port, 'Real Chrome debugging port is ready')
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener('open', resolveOpen, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    let nextId = 0
    const pending = new Map()
    const uncaught = []
    const requests = new Map()
    const captureRequests = []
    let responseDrop
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.method === 'Runtime.exceptionThrown') uncaught.push('Uncaught browser exception')
      if (message.method === 'Network.requestWillBeSent') {
        const request = message.params.request
        const pathname = new URL(request.url).pathname
        if (request.method === 'POST' && /^\/admin\/payments\/[^/]+\/capture$/.test(pathname)) {
          const capture = { path: pathname, status: null }
          requests.set(message.params.requestId, capture)
          captureRequests.push(capture)
        }
      }
      if (message.method === 'Network.responseReceived') {
        const capture = requests.get(message.params.requestId)
        if (capture) capture.status = message.params.response.status
      }
      if (message.method === 'Fetch.requestPaused' && responseDrop) {
        const drop = responseDrop
        responseDrop = null
        void (async () => {
          try {
            assert.equal(message.params.responseStatusCode, 200, 'Dropped checkout response represents a successful native completion')
            const body = await command('Fetch.getResponseBody', { requestId: message.params.requestId })
            const native = JSON.parse(body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body)
            assert.ok(native.order?.id, 'Dropped response contains a real order')
            await command('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'ConnectionClosed' })
            await command('Fetch.disable')
            drop.resolve({ orderId: native.order.id, status: message.params.responseStatusCode })
          } catch (error) {
            await command('Fetch.disable').catch(() => {})
            drop.reject(error)
          }
        })()
      }
      const callback = pending.get(message.id)
      if (!callback) return
      pending.delete(message.id)
      if (message.error) callback.reject(new Error(message.error.message))
      else callback.resolve(message.result)
    })
    const command = (method, params = {}) => new Promise((resolveCommand, reject) => {
      const id = ++nextId
      const timeout = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Chrome timed out: ${method}`))
      }, 20000)
      pending.set(id, {
        resolve: value => { clearTimeout(timeout); resolveCommand(value) },
        reject: error => { clearTimeout(timeout); reject(error) },
      })
      socket.send(JSON.stringify({ id, method, params }))
    })
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) {
        const exception = result.exceptionDetails.exception
        const message = exception?.description?.split('\n')[0] || result.exceptionDetails.text
        throw new Error(`Browser evaluation failed: ${exception?.className || 'Error'}: ${message}`)
      }
      return result.result.value
    }
    const waitFor = async (expression, description = 'Expected browser state') => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (await evaluate(expression)) return
        await delay(150)
      }
      throw new Error(description)
    }
    const navigate = async url => {
      await command('Page.navigate', { url })
      await waitFor('document.readyState === "complete"', 'Page finished loading')
    }
    const click = async selector => {
      const point = await evaluate(`(() => {
        const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(x => x.getClientRects().length)
        if (!el || el.disabled) return null
        el.scrollIntoView({block:'center'})
        const r = el.getBoundingClientRect()
        return {x:r.x+r.width/2,y:r.y+r.height/2}
      })()`)
      assert.ok(point, `Enabled visible control: ${selector}`)
      await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
      await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
    }
    const fill = async (selector, value) => {
      await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, `Input exists: ${selector}`)
      await evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)})
        const prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${JSON.stringify(String(value))})
        input.dispatchEvent(new Event('input',{bubbles:true}))
        input.dispatchEvent(new Event('change',{bubbles:true}))
      })()`)
    }
    const clickText = async (pattern, scope = 'document') => {
      const selector = await evaluate(`(() => {
        const el = [...${scope}.querySelectorAll('button')].find(x => x.getClientRects().length && !x.disabled && new RegExp(${JSON.stringify(pattern)},'i').test(x.textContent.trim()))
        if (!el) return null
        el.setAttribute('data-loyalty-test-target','true')
        return '[data-loyalty-test-target="true"]'
      })()`)
      assert.ok(selector, `Visible button matching ${pattern}`)
      await click(selector)
      await evaluate(`document.querySelector('[data-loyalty-test-target="true"]')?.removeAttribute('data-loyalty-test-target')`)
    }
    const screenshot = async name => {
      const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      await writeFile(`${evidence}/${name}.png`, Buffer.from(shot.data, 'base64'))
    }
    const dropNextCompletionResponse = async () => {
      let resolveDrop
      let rejectDrop
      const dropped = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Native successful checkout response was not intercepted')), 30000)
        resolveDrop = value => { clearTimeout(timeout); resolve(value) }
        rejectDrop = error => { clearTimeout(timeout); reject(error) }
      })
      // Keep an early CDP failure observed while the click command is settling;
      // awaiting the original promise below still surfaces the failure.
      void dropped.catch(() => {})
      responseDrop = { resolve: resolveDrop, reject: rejectDrop }
      await command('Fetch.enable', { patterns: [{ urlPattern: '*/api/cart/complete', requestStage: 'Response' }] })
      return { dropped }
    }
    await command('Page.enable')
    await command('Runtime.enable')
    await command('Network.enable')
    await run({ command, evaluate, waitFor, navigate, click, fill, clickText, screenshot, captureRequests, dropNextCompletionResponse })
    assert.deepEqual(uncaught, [], 'No uncaught browser errors')
  } finally {
    socket?.close()
    chrome.kill('SIGTERM')
    await delay(300)
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
}

export async function runLoyaltyBrowserTests(options) {
  const {
    origin, backendOrigin, customer, admin, product, countryCode,
    firstQuantity, secondQuantity = 1, inspectOrder,
  } = options
  assert.equal(new URL(origin).hostname, '127.0.0.1', 'Replay storefront uses isolated host')
  assert.equal(new URL(backendOrigin).port, '9100', 'Replay Medusa uses isolated port')
  assert.equal(typeof inspectOrder, 'function', 'Real order inspection callback is required')
  const passed = []
  const check = (condition, description) => {
    assert.ok(condition, description)
    passed.push(description)
  }
  let result
  await withLoyaltyBrowser(async browser => {
    const { command, evaluate, waitFor, navigate, click, fill, clickText, screenshot, captureRequests, dropNextCompletionResponse } = browser
    const hydrated = () => waitFor('Boolean(document.querySelector("#__nuxt")?.__vue_app__)', 'Nuxt hydration completed')
    const api = path => evaluate(`fetch(${JSON.stringify(path)}).then(async r=>({status:r.status,body:await r.json()}))`)
    const points = async () => (await api('/api/customer/loyalty-points')).body.points
    const cart = async () => (await api('/api/cart')).body.cart
    const pointText = () => evaluate('Number(document.querySelector("[data-testid=account-points]")?.textContent.replace(/[^0-9-]/g,""))')
    const refreshAccount = async expected => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await points() === expected) break
        await delay(150)
      }
      await navigate(`${origin}/account`)
      await hydrated()
      await waitFor(`Number(document.querySelector('[data-testid=account-points]')?.textContent.replace(/[^0-9-]/g,''))===${expected}`, 'Updated points are visible in account')
      check(await pointText() === expected, `Account displays ${expected} points`)
    }
    const addProduct = async quantity => {
      await navigate(`${origin}/products/${encodeURIComponent(product.handle)}`)
      await hydrated()
      await fill('#product-variant', product.variantId)
      await fill('[data-testid=add-quantity]', quantity)
      await click('[data-testid=add-to-cart]')
      await waitFor('!document.querySelector("[data-testid=add-to-cart]")?.disabled', 'Add to cart finished')
      await navigate(`${origin}/cart`)
      await hydrated()
      await waitFor('Boolean(document.querySelector("[data-testid=save-address]"))', 'Real cart is shown')
    }
    const checkoutAddress = async () => {
      for (const [field, value] of [
        ['first-name', 'Loyalty'], ['last-name', 'Replay'], ['address', 'Test Street 1'],
        ['city', countryCode === 'de' ? 'Berlin' : 'Copenhagen'], ['postal', countryCode === 'de' ? '10115' : '1000'],
        ['country', countryCode],
      ]) await fill(`[data-testid=checkout-${field}]`, value)
      await click('[data-testid=save-address]')
      await waitFor("Array.from(document.querySelector('[data-testid=shipping-option]')?.options || []).some(option => option.value)", 'Actual eligible shipping options loaded')
      const option = await evaluate("Array.from(document.querySelector('[data-testid=shipping-option]').options).find(option => option.value).value")
      await fill('[data-testid=shipping-option]', option)
      await click('[data-testid=save-shipping]')
      const paymentSelect = await evaluate('Boolean(document.querySelector("[data-testid=payment-provider]"))')
      if (paymentSelect) await fill('[data-testid=payment-provider]', 'pp_system_default')
      await waitFor('!document.querySelector("[data-testid=place-order]")?.disabled', 'Shipping saved, System payment selected and checkout ready')
    }
    const placeOrder = async () => {
      await click('[data-testid=place-order]')
      await waitFor('Boolean(document.querySelector("[data-testid=order-id]"))', 'Real order confirmation is displayed')
      const id = await evaluate('document.querySelector("[data-testid=order-id]").textContent.match(/order_[A-Za-z0-9]+/)?.[0]')
      check(Boolean(id), 'Confirmation contains a native order ID')
      return id
    }

    await navigate(`${origin}/login`)
    await hydrated()
    await fill('#email', customer.email)
    await fill('#password', customer.password)
    await click('[data-testid=login-submit]')
    await waitFor('Boolean(document.querySelector("[data-testid=logout]"))', 'Customer logged in through Nuxt')
    await refreshAccount(0)
    const cookies = (await command('Network.getCookies', { urls: [origin] })).cookies
    const session = cookies.find(value => value.name === 'rigby_customer_session')
    check(session?.httpOnly && session.sameSite === 'Lax', 'Customer session stays in HttpOnly SameSite cookie')

    await addProduct(firstQuantity)
    await checkoutAddress()
    const firstCart = await cart()
    check(firstCart?.currency_code === 'eur', 'First cart uses existing EUR region')
    check(Number(firstCart.item_total) >= 100, 'First cart has at least €100 eligible products including VAT')
    const firstOrderId = await placeOrder()
    const firstOrder = await inspectOrder(firstOrderId)
    const firstPayment = firstOrder.payment_collections.flatMap(value => value.payments ?? [])[0]
    check(firstOrder.customer_id === customer.id, 'First persisted order belongs to logged-in customer')
    check(firstPayment?.provider_id === 'pp_system_default' && !firstPayment.captured_at && !firstPayment.captures?.length, 'System payment is authorized and not captured')
    check(await points() === 0, 'Order placement and authorization earn no points')
    const earned = Math.floor(Number(firstOrder.item_total))
    check(earned >= 100, 'Persisted product total earns at least 100 points')

    await navigate(`${backendOrigin}/app/login`)
    await evaluate('localStorage.setItem("i18nextLng","en")')
    await navigate(`${backendOrigin}/app/login`)
    await waitFor('Boolean(document.querySelector("input[name=email]"))', 'Medusa Admin login is ready')
    await fill('input[name=email]', admin.email)
    await fill('input[name=password]', admin.password)
    await click('button[type=submit]')
    await waitFor('!document.querySelector("input[name=password]") && location.pathname.includes("/app/")', 'Admin signed in through its login UI')
    await navigate(`${backendOrigin}/app/orders/${firstOrderId}`)
    await waitFor('[...document.querySelectorAll("button")].some(x=>/capture payment/i.test(x.textContent))', 'Admin offers Capture payment')
    await clickText('^Capture payment')
    await waitFor('Boolean(document.querySelector("[role=alertdialog], [role=dialog]"))', 'Capture confirmation dialog opened')
    await clickText('^Confirm$', 'document.querySelector("[role=alertdialog], [role=dialog]")')
    for (let attempt = 0; attempt < 100 && !captureRequests.some(value => value.status === 200); attempt++) await delay(150)
    check(captureRequests.some(value => value.path === `/admin/payments/${firstPayment.id}/capture` && value.status === 200), 'Real Admin UI issued a successful native capture request')
    const paidOrder = await inspectOrder(firstOrderId)
    check(paidOrder.payment_collections.flatMap(value => value.payments ?? []).some(value => value.id === firstPayment.id && value.captured_at && value.captures?.length), 'Capture is persisted on the real payment')
    await navigate(`${origin}/account`)
    await hydrated()
    await refreshAccount(earned)
    await screenshot('01-earned-points')
    const html = await (await fetch(`${origin}/account`, { headers: { cookie: `${session.name}=${session.value}` } })).text()
    check(html.includes('data-testid="account-points"') && !html.includes(session.value), 'Authenticated balance is SSR rendered without the JWT')

    await addProduct(secondQuantity)
    await checkoutAddress()
    const secondBefore = await cart()
    check(Number(secondBefore.item_total) >= 10, 'Second cart has enough eligible products for a €10 block')
    await fill('[data-testid=loyalty-blocks]', 1)
    await click('[data-testid=apply-loyalty]')
    await waitFor('Boolean(document.querySelector("[data-testid=remove-loyalty]"))', 'Loyalty promotion applied')
    const applied = await cart()
    check(Math.abs(Number(secondBefore.total) - Number(applied.total) - 10) < 0.01, 'Native cart total is reduced by exactly €10')
    check(Math.abs(Number(secondBefore.shipping_total) - Number(applied.shipping_total)) < 0.01, 'Loyalty discount does not reduce shipping')
    check((applied.items ?? []).some(item => item.adjustments?.length), 'Native product adjustments carry the promotion')
    check(await points() === earned, 'Applying loyalty leaves persisted balance unchanged')
    await click('[data-testid=remove-loyalty]')
    await waitFor('Boolean(document.querySelector("[data-testid=apply-loyalty]"))', 'Loyalty promotion removed')
    const removed = await cart()
    check(Math.abs(Number(removed.total) - Number(secondBefore.total)) < 0.01 && await points() === earned, 'Removing restores native totals and preserves points')
    await click('[data-testid=apply-loyalty]')
    await waitFor('Boolean(document.querySelector("[data-testid=remove-loyalty]"))', 'Promotion reapplied for second order')
    await screenshot('02-discounted-cart')
    const secondCart = await cart()
    // Drop the response only after Nitro has received a successful, committed
    // native order. The customer must recover that same order without spending
    // again; the test never fabricates an order or loyalty response.
    const transportLoss = await dropNextCompletionResponse()
    await click('[data-testid=place-order]')
    const dropped = await transportLoss.dropped
    await waitFor('Boolean(document.querySelector("[role=alert]")) && !document.querySelector("[data-testid=place-order]")?.disabled', 'Lost response is reported and checkout leaves its pending state')
    // A reload performs the authoritative cart read. The HttpOnly cart ID must
    // survive the lost response so that this read can reveal the committed order.
    await navigate(`${origin}/cart`)
    await hydrated()
    await waitFor('Boolean(document.querySelector("[data-testid=recover-order]"))', 'Lost response exposes the actual completed-cart recovery action')
    check(await points() === earned - 100, 'Order committed and spent exactly 100 points despite a lost checkout response')
    await click('[data-testid=recover-order]')
    await waitFor('Boolean(document.querySelector("[data-testid=order-id]"))', 'Customer recovered the committed order')
    const secondOrderId = await evaluate('document.querySelector("[data-testid=order-id]").textContent.match(/order_[A-Za-z0-9]+/)?.[0]')
    check(secondOrderId === dropped.orderId, 'Recovery returns the exact order from the lost successful response')
    const secondOrder = await inspectOrder(secondOrderId)
    check(secondOrder.customer_id === customer.id && secondOrder.currency_code === 'eur', 'Discounted cart became a real customer order')
    check(Math.abs(Number(secondOrder.total) - Number(secondCart.total)) < 0.01, 'Persisted second order has the recalculated discounted cart total')
    check(!secondOrder.payment_collections.flatMap(value => value.payments ?? []).some(value => value.captured_at), 'Second order is authorized; it has not prematurely earned more points')
    const finalBalance = earned - 100
    await refreshAccount(finalBalance)
    check(await points() === finalBalance, 'Exactly 100 points were deducted once')
    await navigate(`${origin}/account`)
    await hydrated()
    check(await pointText() === finalBalance, 'Final account balance survives full-page reload')
    await screenshot('03-final-balance')
    result = {
      assertions: passed.length, passed, firstOrderId, firstCartId: firstCart.id,
      firstPaymentId: firstPayment.id, secondOrderId, secondCartId: secondCart.id,
      eligibleFirstProductValue: Number(firstOrder.item_total), earnedPoints: earned,
      discount: Number(secondBefore.total) - Number(secondOrder.total),
      finalBalance, captureRequests, lostResponseRecovery: dropped, screenshots: ['01-earned-points.png', '02-discounted-cart.png', '03-final-balance.png'],
    }
  })
  return result
}
