import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { withWishlistBrowser } from './wishlist-browser.mjs'

const require = createRequire(new URL('../apps/storefront/package.json', import.meta.url))
const Medusa = require('@medusajs/js-sdk').default
const evidence = fileURLToPath(new URL('../apps/storefront/.cache/evidence/', import.meta.url))

// This runner uses real Chrome and the configured, real Medusa API. Registration is
// explicit because successful login/isolation need two disposable customer accounts.
// Credentials and session cookies remain in memory and are never logged or saved.
export async function runStorefrontBrowserTests({ origin, registerCustomers = false, customers = [] }) {
  const passed = []
  const skipped = []
  const check = (condition, description) => {
    assert.ok(condition, description)
    passed.push(description)
  }
  await mkdir(evidence, { recursive: true })
  await withWishlistBrowser(async browser => {
    const { command, fill, navigate } = browser
    let stage = 'catalog bootstrap'
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) {
        const summary = await command('Runtime.evaluate', {
          expression: 'JSON.stringify({path:location.pathname,ready:document.readyState,cards:document.querySelectorAll("[data-testid=product-card]").length,detail:Boolean(document.querySelector("[data-testid=product-detail]")),hasAlert:Boolean(document.querySelector("[role=alert]"))})',
          returnByValue: true,
        })
        throw new Error(`${stage}: browser evaluation failed (${result.exceptionDetails.exception?.className || result.exceptionDetails.text}); state=${summary.result?.value || 'unavailable'}`)
      }
      return result.result.value
    }
    const click = async selector => {
      const point = await evaluate(`(() => {
        const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(item => item.getClientRects().length)
        if (!el) return null
        el.scrollIntoView({ block: 'center' })
        const rect = el.getBoundingClientRect()
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      })()`)
      assert.ok(point, `Visible click target: ${selector}`)
      await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
      await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
    }
    const waitFor = async expression => {
      try {
        await browser.waitFor(expression)
      } catch {
        throw new Error(`Expected browser state did not appear: ${expression}`)
      }
    }
    const hydrated = () => waitFor('Boolean(document.querySelector("#__nuxt")?.__vue_app__)')
    const screenshot = async name => {
      const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      await writeFile(`${evidence}/${name}.png`, Buffer.from(shot.data, 'base64'))
    }
    const resize = width => command('Emulation.setDeviceMetricsOverride', {
      width, height: width === 375 ? 812 : 1000, deviceScaleFactor: 1, mobile: width === 375,
    })
    const noOverflow = async description => check(await evaluate(
      'document.documentElement.scrollWidth <= innerWidth + 1',
    ), description)
    const focusable = async () => {
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      check(await evaluate(`(() => {
        const el = document.activeElement
        if (!el || el === document.body || !el.matches(':focus-visible')) return false
        const css = getComputedStyle(el)
        return css.outlineStyle !== 'none' || css.boxShadow !== 'none'
      })()`), 'Keyboard Tab produces visible focus')
    }
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__qaHydrationWarnings = []
      const warn = console.warn
      console.warn = (...args) => {
        if (args.some(arg => typeof arg === 'string' && /hydration/i.test(arg))) window.__qaHydrationWarnings.push('hydration')
        warn.apply(console, args)
      }
    ` })
    await resize(1440)
    await navigate(origin)
    await hydrated()
    await waitFor('Boolean(document.querySelector("[data-testid=product-card]"))')

    // Public runtime configuration is consumed in memory, never printed.
    stage = 'public runtime configuration'
    const config = await evaluate(`(() => {
      const runtime = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$config.public
      return { medusaBackendUrl: runtime.medusaBackendUrl, medusaPublishableKey: runtime.medusaPublishableKey }
    })()`)
    assert.equal(typeof config.medusaBackendUrl, 'string', 'Public backend URL is serialized as a plain scalar')
    assert.ok(['http:', 'https:'].includes(new URL(config.medusaBackendUrl).protocol), 'Public backend URL is absolute HTTP(S)')
    const sdk = new Medusa({
      baseUrl: config.medusaBackendUrl,
      publishableKey: config.medusaPublishableKey,
      auth: { type: 'jwt', jwtTokenStorageMethod: 'memory' },
    })
    stage = 'real regional catalog'
    const { regions } = await sdk.store.region.list({ limit: 100 }).catch(error => {
      throw new Error(`${stage}: region SDK request failed (${error.name})`)
    })
    check(regions.length > 0, 'Live Medusa provides regional pricing context')
    const regionId = await evaluate('document.querySelector("[data-region-id]")?.dataset.regionId || null')
    const region = regions[0]
    check(regionId === region.id, 'Catalog uses the first Medusa region as the single market')
    check(await evaluate('!document.querySelector("[data-testid=region-selector]")'), 'Catalog has no region selector')
    check(!(await command('Network.getCookies', { urls: [origin] })).cookies.some(cookie => cookie.name === 'rigby-region-id'), 'Catalog does not create a region preference cookie')
    const { products } = await sdk.store.product.list({
      region_id: region.id,
      fields: '*variants.calculated_price,*variants.options,*options',
      limit: 100,
    }).catch(error => {
      throw new Error(`${stage}: product SDK request failed (${error.name})`)
    })
    check(products.length > 0, 'Live Medusa provides actual products')
    const cards = await evaluate(`Array.from(document.querySelectorAll('[data-testid=product-card]')).map(card => ({
      id: card.dataset.productId,
      title: card.querySelector('h2,h3')?.textContent.trim(),
      href: card.querySelector('a[href^="/products/"]')?.getAttribute('href'),
      image: card.querySelector('img')?.getAttribute('src'),
      text: card.innerText
    }))`)
    check(cards.every(card => products.some(product => product.id === card.id && product.title === card.title)), 'Every rendered card uses real Medusa identity and title')
    const chosen = cards.find(card => card.href && products.some(product => product.id === card.id))
    check(chosen, 'Catalog links to a real product handle')
    const product = products.find(item => item.id === chosen.id)
    check(chosen.href === `/products/${encodeURIComponent(product.handle)}`, 'Product link uses the actual handle')
    if (product.thumbnail || product.images?.length) {
      check([product.thumbnail, ...(product.images || []).map(image => image.url)].includes(chosen.image), 'Product image comes from real Medusa media')
      await waitFor(`document.querySelector('[data-testid=product-card][data-product-id="${product.id}"] img').complete`)
      check(await evaluate(`document.querySelector('[data-testid=product-card][data-product-id="${product.id}"] img').naturalWidth > 0`), 'Actual product image loads in Chrome')
    }
    const validPrices = product.variants.flatMap(variant => {
      const price = variant.calculated_price
      return price && typeof price.calculated_amount === 'number' && Number.isFinite(price.calculated_amount)
        && price.calculated_amount >= 0 && /^[a-z]{3}$/i.test(price.currency_code || '') ? [price] : []
    })
    const normalized = text => text.replace(/\s/g, '').replace(/,/g, '.')
    if (validPrices.length) {
      const lowest = validPrices.reduce((left, right) => left.calculated_amount <= right.calculated_amount ? left : right)
      const expected = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: lowest.currency_code }).format(lowest.calculated_amount)
      check(normalized(chosen.text).includes(normalized(expected)), 'Catalog price equals regional calculated_amount without division by 100')
    } else skipped.push('Selected real product has no valid regional price; no live numeric-price assertion possible')
    const catalogResponse = await fetch(origin)
    const ssr = await catalogResponse.text()
    check(ssr.includes('data-testid="product-card"') && ssr.includes(product.id), 'Catalog products are rendered by SSR')
    check(!ssr.includes('data-testid="region-selector"'), 'Catalog SSR has no region selector')
    check(!catalogResponse.headers.getSetCookie().some(cookie => cookie.startsWith('rigby-region-id=')), 'Catalog SSR does not create a region preference cookie')
    check((await evaluate('window.__qaHydrationWarnings')).length === 0, 'Catalog hydrates without mismatch warnings')
    await noOverflow('Desktop catalog has no horizontal overflow')
    await focusable()
    await evaluate('document.activeElement?.blur()')
    await screenshot('catalog-1440')

    stage = 'single market ignores legacy preference'
    const staleRegionId = regions.find(item => item.id !== region.id)?.id || 'reg_qa_stale_market'
    const staleCookie = `rigby-region-id=${staleRegionId}`
    const setCookie = await command('Network.setCookie', { name: 'rigby-region-id', value: staleRegionId, url: origin, path: '/' })
    assert.ok(setCookie.success, 'Legacy region cookie is installed for the regression test')
    await navigate(origin)
    await hydrated()
    await waitFor('Boolean(document.querySelector("[data-testid=product-card]"))')
    check(await evaluate(`document.querySelector('[data-region-id]')?.dataset.regionId === ${JSON.stringify(region.id)}`), 'Catalog ignores a stale region cookie after browser refresh')
    check(await evaluate('!document.querySelector("[data-testid=region-selector]")'), 'Legacy region preference does not expose a catalog selector')
    const priceData = await evaluate(`Array.from(document.querySelectorAll('[data-testid=product-card]')).map(card => ({
      id: card.dataset.productId,
      amount: card.querySelector('[data-testid=product-price]')?.dataset.amount,
      currency: card.querySelector('[data-testid=product-price]')?.dataset.currency,
    }))`)
    check(priceData.length > 0 && priceData.every(card => {
      const actual = products.find(item => item.id === card.id)
      if (!actual) return false
      const valid = (actual.variants || []).flatMap(variant => {
        const price = variant.calculated_price
        return price && typeof price.calculated_amount === 'number' && Number.isFinite(price.calculated_amount)
          && price.calculated_amount >= 0 && price.currency_code?.toLowerCase() === region.currency_code.toLowerCase() ? [price.calculated_amount] : []
      })
      return valid.length ? Number(card.amount) === Math.min(...valid) && card.currency === region.currency_code.toUpperCase() : card.amount === undefined
    }), 'Legacy cookie leaves catalog prices in the default market currency with real Medusa amounts')
    const ssrPrices = html => Array.from(html.matchAll(/<p\b[^>]*\bdata-testid="product-price"[^>]*>/g), ([tag]) => ({
      amount: tag.match(/\bdata-amount="([^"]*)"/)?.[1],
      currency: tag.match(/\bdata-currency="([^"]*)"/)?.[1],
    }))
    const staleCatalogSSR = await (await fetch(origin, { headers: { cookie: staleCookie } })).text()
    check(staleCatalogSSR.includes(`data-region-id="${region.id}"`) && staleCatalogSSR.includes(product.id), 'Catalog SSR ignores the stale region cookie')
    check(JSON.stringify(ssrPrices(staleCatalogSSR)) === JSON.stringify(ssrPrices(ssr)), 'Legacy cookie leaves SSR catalog prices unchanged')
    check(JSON.stringify(ssrPrices(staleCatalogSSR)) === JSON.stringify(priceData.filter(card => card.amount !== undefined).map(({ amount, currency }) => ({ amount, currency }))), 'SSR catalog prices match the verified default market amounts and currency')
    check((await evaluate('window.__qaHydrationWarnings')).length === 0, 'Catalog with stale region cookie hydrates without mismatch warnings')

    for (const width of [768, 375]) {
      stage = `${width}px responsive catalog`
      await resize(width)
      await noOverflow(`${width}px catalog has no horizontal overflow`)
      await screenshot(`catalog-${width}`)
    }
    const menu = '[data-testid="mobile-menu-toggle"]'
    check(await evaluate(`Boolean(document.querySelector(${JSON.stringify(menu)}))`), 'Mobile menu trigger exists')
    await click(menu)
    check(await evaluate(`document.querySelector(${JSON.stringify(menu)}).getAttribute('aria-expanded') === 'true'`), 'Mobile menu opens with accessible expanded state')
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await waitFor(`document.querySelector(${JSON.stringify(menu)}).getAttribute('aria-expanded') === 'false'`)
    passed.push('Escape closes mobile menu')

    stage = 'product detail and variant pricing'
    await navigate(`${origin}${chosen.href}`)
    await hydrated()
    await waitFor('Boolean(document.querySelector("[data-testid=product-detail]"))')
    check(await evaluate('!document.querySelector("[data-testid=region-selector]")'), 'PDP has no region selector')
    check(await evaluate(`document.querySelector('[data-region-id]')?.dataset.regionId === ${JSON.stringify(region.id)}`), 'PDP ignores the stale region cookie in the browser')
    check(await evaluate(`document.querySelector('[data-testid=product-detail]').dataset.productId === ${JSON.stringify(product.id)}`), 'PDP keeps actual product ID')
    check(await evaluate(`document.querySelector('h1').textContent.trim() === ${JSON.stringify(product.title)}`), 'PDP renders real product title')
    const detailResponse = await fetch(`${origin}${chosen.href}`)
    const detailSSR = await detailResponse.text()
    check(detailSSR.includes('data-testid="product-detail"') && detailSSR.includes(product.id), 'PDP product data is present in SSR HTML')
    check(!detailSSR.includes('data-testid="region-selector"'), 'PDP SSR has no region selector')
    check(!detailResponse.headers.getSetCookie().some(cookie => cookie.startsWith('rigby-region-id=')), 'PDP SSR does not create a region preference cookie')
    const staleDetailSSR = await (await fetch(`${origin}${chosen.href}`, { headers: { cookie: staleCookie } })).text()
    check(staleDetailSSR.includes(`data-region-id="${region.id}"`) && staleDetailSSR.includes(product.id), 'PDP SSR ignores the stale region cookie')
    check(JSON.stringify(ssrPrices(staleDetailSSR)) === JSON.stringify(ssrPrices(detailSSR)), 'Legacy cookie leaves SSR PDP prices unchanged')
    const staleDetailPrices = await evaluate(`Array.from(document.querySelectorAll('[data-testid=product-price]')).map(price => ({ amount: price.dataset.amount, currency: price.dataset.currency }))`)
    check(JSON.stringify(staleDetailPrices) === JSON.stringify(ssrPrices(detailSSR)), 'PDP browser prices with legacy cookie match the default market SSR prices')
    check((await evaluate('window.__qaHydrationWarnings')).length === 0, 'PDP with stale region cookie hydrates without mismatch warnings')
    await command('Network.deleteCookies', { name: 'rigby-region-id', url: origin })
    await navigate(`${origin}${chosen.href}`)
    await hydrated()
    await waitFor('Boolean(document.querySelector("[data-testid=product-detail]"))')
    check(!(await command('Network.getCookies', { urls: [origin] })).cookies.some(cookie => cookie.name === 'rigby-region-id'), 'PDP does not create a region preference cookie')
    if (product.variants.length > 1) {
      const variant = '[data-testid="product-variant"]'
      const available = await evaluate(`Array.from(document.querySelector(${JSON.stringify(variant)}).options).map(el => ({ value: el.value, disabled: el.disabled }))`)
      check(available.length > 1, 'PDP exposes actual variant choices')
      const next = available.findLast(item => !item.disabled && item.value)
      check(next, 'PDP has a selectable variant')
      await evaluate(`(() => {
        const select = document.querySelector(${JSON.stringify(variant)})
        select.value = ${JSON.stringify(next.value)}
        select.dispatchEvent(new Event('change', { bubbles: true }))
      })()`)
      check(await evaluate(`document.querySelector(${JSON.stringify(variant)}).value === ${JSON.stringify(next.value)}`), 'Native variant selection updates accessible selected state')
      const selected = product.variants.find(value => value.id === next.value)
      check(selected, 'Variant selector uses a real Medusa variant identifier')
      const selectedPrice = selected.calculated_price
      if (selectedPrice && typeof selectedPrice.calculated_amount === 'number' && Number.isFinite(selectedPrice.calculated_amount) && selectedPrice.calculated_amount >= 0 && /^[a-z]{3}$/i.test(selectedPrice.currency_code || '')) {
        const expected = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: selectedPrice.currency_code }).format(selectedPrice.calculated_amount)
        check(normalized(await evaluate('document.querySelector("[data-testid=product-detail]").innerText')).includes(normalized(expected)), 'PDP price matches selected real regional variant')
      }
    }
    await noOverflow('Mobile PDP has no horizontal overflow')
    await screenshot('product-375')
    await resize(1440)
    await noOverflow('Desktop PDP has no horizontal overflow')
    await screenshot('product-1440')
    await click(`[data-testid="wishlist-toggle"][data-product-id="${product.id}"]`)
    stage = 'anonymous wishlist and invalid login'
    await waitFor('location.pathname === "/login"')
    passed.push('Anonymous wishlist action navigates to login')
    await hydrated()
    check(await evaluate('Boolean(document.querySelector("label[for=email]") && document.querySelector("label[for=password]"))'), 'Login inputs have associated labels')
    await fill('#email', `missing-${randomUUID()}@example.invalid`)
    await fill('#password', randomUUID())
    await click('[data-testid="login-submit"]')
    await waitFor('Boolean(document.querySelector("[role=alert]")) && !document.querySelector("[data-testid=login-submit]").disabled')
    check(await evaluate('location.pathname === "/login" && !document.querySelector("[data-testid=logout]")'), 'Invalid login stays anonymous and recovers pending state')
    // Clear fields before evidence to avoid persisting even generated credentials.
    await fill('#email', '')
    await fill('#password', '')
    await resize(375)
    await noOverflow('Mobile login has no horizontal overflow')
    await screenshot('login-375')
    await resize(1440)

    if (registerCustomers && customers.length === 0) {
      stage = 'authorized disposable customer registration'
      for (const name of ['alpha', 'beta']) {
        const customer = { email: `storefront-qa-${name}-${randomUUID()}@example.invalid`, password: randomUUID() }
        const token = await sdk.auth.register('customer', 'emailpass', customer)
        assert.equal(typeof token, 'string', 'Disposable registration returns a JWT')
        await sdk.client.setToken(token)
        await sdk.store.customer.create({ email: customer.email, first_name: 'Storefront QA' })
        customers.push(customer)
      }
      passed.push('Two disposable customers registered through normal Medusa APIs')
    }
    if (customers.length >= 2) {
      stage = 'authenticated wishlist regression'
      const toggle = `[data-testid="wishlist-toggle"][data-product-id="${product.id}"]`
      const item = `[data-testid="wishlist-item"][data-product-id="${product.id}"]`
      const login = async customer => {
        await navigate(`${origin}/login`)
        await hydrated()
        await fill('#email', customer.email)
        await fill('#password', customer.password)
        await click('[data-testid="login-submit"]')
        await waitFor('location.pathname === "/wishlist" && Boolean(document.querySelector("[data-testid=logout]"))')
      }
      const logout = async () => {
        await click('[data-testid="logout"]')
        await waitFor('location.pathname === "/login" && Boolean(document.querySelector("#email"))')
      }
      await login(customers[0])
      const cookie = (await command('Network.getCookies', { urls: [origin] })).cookies.find(value => value.name === 'rigby_customer_session')
      check(cookie?.httpOnly && cookie.sameSite === 'Lax', 'Login uses protected HttpOnly SameSite=Lax session cookie')
      check(!(await evaluate('document.cookie')).includes('rigby_customer_session'), 'Session cookie is inaccessible to page JavaScript')
      check(!(await evaluate('JSON.stringify({ ...localStorage, ...sessionStorage })')).includes(cookie.value), 'Session token is absent from browser storage')
      await navigate(origin)
      await hydrated()
      await waitFor(`Boolean(document.querySelector(${JSON.stringify(toggle)}))`)
      const originallySaved = await evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-pressed') === 'true'`)
      if (originallySaved) {
        await click(toggle)
        await waitFor(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-pressed') === 'false'`)
      }
      const initialCount = await evaluate('Number(document.querySelector("[data-testid=wishlist-count]").textContent.trim())')
      try {
        await click(toggle)
        await waitFor(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-pressed') === 'true'`)
        check(await evaluate('Number(document.querySelector("[data-testid=wishlist-count]").textContent.trim())') === initialCount + 1, 'Wishlist count updates after adding')
        await navigate(`${origin}/wishlist`)
        await hydrated()
        await waitFor(`Boolean(document.querySelector(${JSON.stringify(item)}))`)
        passed.push('Wishlist survives actual browser page refresh')
        const privateHTML = await (await fetch(`${origin}/wishlist`, { headers: { cookie: `${cookie.name}=${cookie.value}` } })).text()
        check(privateHTML.includes('data-testid="wishlist-item"') && privateHTML.includes(product.id), 'Authenticated wishlist is server rendered')
        check(!privateHTML.includes(cookie.value), 'Session token is absent from SSR HTML and hydration payload')
        await logout()
        check(!(await evaluate('document.body.innerText')).includes(customers[0].email), 'Logout removes customer identity from the page')
        await login(customers[1])
        check(!(await evaluate(`Boolean(document.querySelector(${JSON.stringify(item)}))`)), 'Second customer cannot see first customer wishlist')
        await logout()
        await login(customers[0])
        await waitFor(`Boolean(document.querySelector(${JSON.stringify(item)}))`)
        passed.push('Wishlist persists across logout and login')
        await click(toggle)
        await waitFor(`!document.querySelector(${JSON.stringify(item)})`)
        check(await evaluate('Number(document.querySelector("[data-testid=wishlist-count]").textContent.trim())') === initialCount, 'Removing wishlist item restores count')
        await navigate(`${origin}/wishlist`)
        await hydrated()
        check(!(await evaluate(`Boolean(document.querySelector(${JSON.stringify(item)}))`)), 'Removed item stays removed after refresh')
        if (originallySaved) {
          await navigate(origin)
          await hydrated()
          await click(toggle)
          await waitFor(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-pressed') === 'true'`)
        }
        await logout()
      } catch (error) {
        // Restore only this runner's addition; never erase another wishlist.
        await navigate(`${origin}/login`)
        await hydrated()
        if (await evaluate('Boolean(document.querySelector("[data-testid=logout]"))')) await logout()
        await login(customers[0])
        await navigate(origin)
        await hydrated()
        const saved = await evaluate(`document.querySelector(${JSON.stringify(toggle)})?.getAttribute('aria-pressed') === 'true'`)
        if (saved !== originallySaved) {
          await click(toggle)
          await waitFor(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-pressed') === '${originallySaved}'`)
        }
        await logout()
        throw error
      }
    } else skipped.push('Successful login, HttpOnly cookie, wishlist mutations/persistence/isolation/logout: two authorized test customers unavailable')

    stage = 'unknown product HTTP404'
    const missing = `${origin}/products/qa-missing-${randomUUID()}`
    const missingResponse = await fetch(missing)
    check(missingResponse.status === 404, 'Unknown handle returns real HTTP 404')
    await navigate(missing)
    await hydrated()
    check(await evaluate('document.body.innerText.includes("404")'), 'Unknown handle presents browser 404 state')
    await screenshot('product-404')
  })
  return { passed: passed.length, checks: passed, skipped, evidence: 'apps/storefront/.cache/evidence/', disposableCustomersCreated: registerCustomers ? customers.length : 0 }
}

// Synthetic failure boundaries run in Chrome separately from the live suite.
// Only failure/empty/missing-price responses are injected; successful data and
// delayed data still come from the actual configured Medusa API.
export async function runStorefrontFailureBrowserTests({ origin, customers = [] }) {
  const passed = []
  const skipped = []
  await mkdir(evidence, { recursive: true })
  const modes = ['loading', 'catalog-error', 'catalog-empty', 'missing-price', 'detail-error']
  if (customers.length) modes.push('wishlist-error')
  else skipped.push('Synthetic wishlist mutation failure needs an authorized customer in memory')
  for (const mode of modes) {
    await withWishlistBrowser(async ({ command, navigate, waitFor, evaluate, click, fill }) => {
      await command('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.__qaFailureMode = ${JSON.stringify(mode)}
        window.__qaIntercepted = 0
        const actualFetch = window.fetch.bind(window)
        window.fetch = async (...args) => {
          const input = args[0]
          const url = typeof input === 'string' ? input : input?.url || String(input)
          const path = new URL(url, location.href).pathname
          if (window.__qaFailureMode === 'wishlist-error' && path.startsWith('/api/wishlist/items')) {
            window.__qaIntercepted++
            return new Response(JSON.stringify({ message: 'Synthetic QA wishlist failure' }), {
              status: 503, headers: { 'Content-Type': 'application/json' },
            })
          }
          if (!path.startsWith('/store/products')) return actualFetch(...args)
          window.__qaIntercepted++
          const failureMode = window.__qaFailureMode
          if (failureMode === 'loading') await new Promise(resolve => setTimeout(resolve, 1800))
          if (failureMode === 'catalog-error' || failureMode === 'detail-error') {
            return new Response(JSON.stringify({ message: 'Synthetic QA upstream failure' }), {
              status: 503, headers: { 'Content-Type': 'application/json' },
            })
          }
          if (failureMode === 'catalog-empty') {
            return new Response(JSON.stringify({ products: [], count: 0, offset: 0, limit: 20 }), {
              status: 200, headers: { 'Content-Type': 'application/json' },
            })
          }
          const response = await actualFetch(...args)
          if (failureMode !== 'missing-price' || !response.ok) return response
          const payload = await response.json()
          for (const product of payload.products || []) {
            for (const variant of product.variants || []) variant.calculated_price = null
          }
          return new Response(JSON.stringify(payload), {
            status: response.status, headers: { 'Content-Type': 'application/json' },
          })
        }
      ` })
      await navigate(`${origin}${mode === 'detail-error' ? '/' : '/login'}`)
      await waitFor('Boolean(document.querySelector("#__nuxt")?.__vue_app__)')
      if (mode === 'wishlist-error') {
        await fill('#email', customers[0].email)
        await fill('#password', customers[0].password)
        await click('[data-testid="login-submit"]')
        await waitFor('location.pathname === "/wishlist" && Boolean(document.querySelector("[data-testid=logout]"))')
        await navigate(origin)
        await waitFor('Boolean(document.querySelector("[data-testid=wishlist-toggle]")) && Boolean(document.querySelector("#__nuxt")?.__vue_app__)')
        const productId = await evaluate('document.querySelector("[data-testid=wishlist-toggle]").dataset.productId')
        const toggle = `[data-testid="wishlist-toggle"][data-product-id="${productId}"]`
        const original = await evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-pressed')`)
        const count = await evaluate('document.querySelector("[data-testid=wishlist-count]").textContent.trim()')
        try {
          await click(toggle)
          await waitFor('Boolean(document.querySelector("[role=alert]")) && !document.querySelector("[data-testid=wishlist-toggle]").disabled')
          assert.equal(await evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-pressed')`), original)
          assert.equal(await evaluate('document.querySelector("[data-testid=wishlist-count]").textContent.trim()'), count)
          passed.push('Synthetic failed wishlist mutation keeps prior saved state/count and re-enables action')
          const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
          await writeFile(`${evidence}/synthetic-wishlist-error.png`, Buffer.from(shot.data, 'base64'))
          await evaluate('window.__qaFailureMode = "live"')
          await click(toggle)
          await waitFor(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-pressed') !== '${original}' && !document.querySelector(${JSON.stringify(toggle)}).disabled`)
          passed.push('Wishlist recovers after synthetic mutation failure using the real backend')
        } finally {
          await evaluate('window.__qaFailureMode = "live"')
          await waitFor(`!document.querySelector(${JSON.stringify(toggle)}).disabled`)
          if (await evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-pressed') !== '${original}'`)) {
            await click(toggle)
            await waitFor(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-pressed') === '${original}' && !document.querySelector(${JSON.stringify(toggle)}).disabled`)
          }
          await click('[data-testid="logout"]')
          await waitFor('location.pathname === "/login"')
        }
        return
      }
      if (mode === 'detail-error') await click('[data-testid="product-card"] a[href^="/products/"]')
      else await click('a[href="/"]')
      await waitFor('window.__qaIntercepted > 0')
      if (mode === 'loading') {
        await waitFor('/Ładowanie|Wczytywanie/i.test(document.body.innerText)')
        passed.push('Synthetic delayed request displays actual catalog loading state')
        const pendingShot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
        await writeFile(`${evidence}/synthetic-loading-pending.png`, Buffer.from(pendingShot.data, 'base64'))
        await waitFor('Boolean(document.querySelector("[data-testid=product-card]"))')
        passed.push('Delayed request resolves with actual Medusa products')
      } else if (mode.endsWith('error')) {
        await waitFor('Boolean(document.querySelector("[role=alert]"))')
        assert.ok(!(await evaluate('document.querySelector("h1")?.textContent || ""')).includes('404'), 'Upstream failure must not be shown as product 404')
        passed.push(`Synthetic ${mode} displays accessible error rather than 404`)
        const failureShot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
        await writeFile(`${evidence}/synthetic-${mode}-failed.png`, Buffer.from(failureShot.data, 'base64'))
        await evaluate('window.__qaFailureMode = "live"')
        const retry = await evaluate(`Array.from(document.querySelectorAll('button')).findIndex(button => /spróbuj|ponów|odśwież/i.test(button.textContent))`)
        assert.ok(retry >= 0, 'Upstream error offers retry')
        await evaluate(`document.querySelectorAll('button')[${retry}].click()`)
        await waitFor(`Boolean(document.querySelector('[data-testid=${mode === 'detail-error' ? 'product-detail' : 'product-card'}]'))`)
        passed.push(`Synthetic ${mode} retry recovers with real Medusa data`)
      } else if (mode === 'catalog-empty') {
        await waitFor('/Brak.*produkt|Nie ma.*produkt|kolekcja.*pusta/i.test(document.body.innerText)')
        assert.equal(await evaluate('document.querySelectorAll("[data-testid=product-card]").length'), 0)
        passed.push('Synthetic empty catalog shows helpful empty state without invented products')
      } else {
        await waitFor('Boolean(document.querySelector("[data-testid=product-card]"))')
        assert.equal(await evaluate('document.querySelectorAll("[data-testid=product-price]").length'), 0, 'Missing calculated prices must remain hidden')
        passed.push('Synthetic missing calculated_price renders actual products without fabricated prices')
      }
      const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      await writeFile(`${evidence}/synthetic-${mode}.png`, Buffer.from(shot.data, 'base64'))
    })
  }
  return { synthetic: true, passed: passed.length, checks: passed, skipped, evidence: 'apps/storefront/.cache/evidence/' }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const origin = process.argv.find(argument => argument.startsWith('--origin='))?.slice('--origin='.length) || 'http://localhost:3000'
  try {
    if (process.argv.includes('--diagnose-runtime')) {
      await withWishlistBrowser(async ({ command, navigate, waitFor }) => {
        await navigate(origin)
        await waitFor('Boolean(document.querySelector("#__nuxt")?.__vue_app__)')
        const result = await command('Runtime.evaluate', { returnByValue: true, expression: `(() => {
          const publicConfig = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$config.public
          let absoluteBackendURL = false
          try { absoluteBackendURL = ['http:', 'https:'].includes(new URL(publicConfig.medusaBackendUrl).protocol) } catch {}
          return JSON.stringify({
            keys: Object.keys(publicConfig),
            backendURLType: typeof publicConfig.medusaBackendUrl,
            absoluteBackendURL,
            publishableKeyType: typeof publicConfig.medusaPublishableKey,
            hasPublishableKey: Boolean(publicConfig.medusaPublishableKey),
          })
        })()` })
        console.log(result.result.value || 'Runtime diagnostic unavailable')
      })
    } else if (process.argv.includes('--all')) {
      const customers = []
      const live = await runStorefrontBrowserTests({ origin, customers, registerCustomers: process.argv.includes('--register-customers') })
      const failures = await runStorefrontFailureBrowserTests({ origin, customers })
      console.log(JSON.stringify({ live, failures }, null, 2))
    } else if (process.argv.includes('--failure-boundaries')) {
      console.log(JSON.stringify(await runStorefrontFailureBrowserTests({ origin }), null, 2))
    } else {
      console.log(JSON.stringify(await runStorefrontBrowserTests({ origin, registerCustomers: process.argv.includes('--register-customers') }), null, 2))
    }
  } catch (error) {
    console.error(`Storefront browser check failed: ${error.message}`)
    process.exitCode = 1
  }
}
