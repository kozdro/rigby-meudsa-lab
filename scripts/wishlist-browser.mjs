import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

// Real local Chrome, no mocked HTTP and no installed browser dependency.
export async function withWishlistBrowser(run) {
  const cache = fileURLToPath(new URL('../apps/storefront/.cache/', import.meta.url))
  await mkdir(cache, { recursive: true })
  const profile = await mkdtemp(`${cache}/wishlist-chrome-`)
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-sync', '--disable-background-networking', 'about:blank',
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
    assert.ok(port, 'Chrome debugging port ready')
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener('open', resolveOpen, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    let nextId = 0
    const pending = new Map()
    const errors = []
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.method === 'Runtime.exceptionThrown') errors.push('Uncaught browser exception')
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push('Browser console.error')
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
      assert.ok(!result.exceptionDetails, 'Browser evaluation succeeded')
      return result.result.value
    }
    const waitFor = async expression => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(expression)) return
        await delay(150)
      }
      throw new Error('Expected browser state did not appear')
    }
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
    const fill = (selector, value) => evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)})
      input.value = ${JSON.stringify(value)}
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    const navigate = async url => {
      await command('Page.navigate', { url })
      await waitFor('document.readyState === "complete"')
    }
    await command('Runtime.enable')
    await command('Page.enable')
    await run({ command, evaluate, waitFor, click, fill, navigate, errors })
    const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    await writeFile(`${cache}/wishlist-browser.png`, Buffer.from(screenshot.data, 'base64'))
    assert.deepEqual(errors, [], 'No browser exceptions or console errors')
  } finally {
    socket?.close()
    chrome.kill('SIGTERM')
    await delay(500)
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
}

export async function runWishlistBrowserTests({ origin, alice, bob, productId }) {
  let assertions = 0
  await withWishlistBrowser(async browser => {
    const { navigate, waitFor, fill, click, evaluate, command } = browser
    const toggle = `[data-testid="wishlist-toggle"][data-product-id="${productId}"]`
    const item = `[data-testid="wishlist-item"][data-product-id="${productId}"]`
    const hydrated = async () => waitFor('Boolean(document.querySelector("#__nuxt").__vue_app__)')
    async function login(customer) {
      await navigate(`${origin}/login`)
      await hydrated()
      await fill('#email', customer.email)
      await fill('#password', customer.password)
      await click('[data-testid="login-submit"]')
      await waitFor('location.pathname === "/wishlist" && Boolean(document.querySelector("[data-testid=logout]"))')
    }
    await navigate(`${origin}/wishlist`)
    await hydrated()
    assert.ok(await evaluate('document.body.innerText.includes("Zaloguj się, aby zobaczyć zapisane produkty.")'))
    assertions++
    await login(alice)
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(item)}))`)
    assertions++
    const cookies = await command('Network.getCookies', { urls: [origin] })
    const cookie = cookies.cookies.find(value => value.name === 'rigby_customer_session')
    assert.ok(cookie?.httpOnly && cookie.sameSite === 'Lax', 'Customer cookie protected')
    assert.ok(!(await evaluate('document.cookie')).includes('rigby_customer_session'))
    assertions += 2
    const response = await fetch(`${origin}/wishlist`, { headers: { cookie: `${cookie.name}=${cookie.value}` } })
    const html = await response.text()
    assert.ok(html.includes('data-testid="wishlist-item"'), 'Wishlist rendered in SSR HTML')
    assert.ok(!html.includes(alice.token) && !html.includes(cookie.value), 'JWT absent from SSR payload')
    assertions += 2
    await click(toggle)
    await waitFor(`!document.querySelector(${JSON.stringify(item)}) && document.body.innerText.includes("Nie masz jeszcze ulubionych produktów.")`)
    assertions++
    await navigate(`${origin}/`)
    await hydrated()
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(toggle)}))`)
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-pressed')`), 'false')
    await click(toggle)
    await waitFor(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-pressed') === 'true'`)
    assertions += 2
    await navigate(`${origin}/wishlist`)
    await hydrated()
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(item)}))`)
    assertions++
    await click('[data-testid="logout"]')
    await waitFor('location.pathname === "/login" && Boolean(document.querySelector("#email"))')
    assert.ok(!(await evaluate('document.body.innerText')).includes(alice.email), 'Logout removes old user')
    assertions++
    await login(bob)
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(item)}))`)
    assert.ok(!(await evaluate('document.body.innerText')).includes(alice.email), 'Account switch removes old user')
    await click(toggle)
    await waitFor(`!document.querySelector(${JSON.stringify(item)})`)
    assertions++
    await click('[data-testid="logout"]')
    await waitFor('location.pathname === "/login"')
    await login(alice)
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(item)}))`)
    assertions++
  })
  return { assertions }
}
