import assert from 'node:assert/strict'
import test from 'node:test'
import { getProductPrice, getVariantPrice } from '../apps/storefront/app/utils/pricing.ts'

const variant = (amount, currency = 'eur') => ({
  calculated_price: { calculated_amount: amount, currency_code: currency },
})
const product = (...variants) => ({ variants })

test('regional variant amount is displayed as supplied, including fractional amounts', () => {
  const result = getVariantPrice(variant(129.95), 'eur')
  assert.equal(result.amount, 129.95)
  assert.equal(result.currencyCode, 'EUR')
  assert.equal(result.formatted, new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'EUR' }).format(129.95))
})

test('zero is a valid price', () => {
  const result = getVariantPrice(variant(0, 'pln'), 'pln')
  assert.equal(result.amount, 0)
  assert.equal(result.currencyCode, 'PLN')
})

test('missing calculated price does not invent a price', () => {
  for (const value of [null, undefined, {}, { calculated_price: null }, { calculated_price: {} }]) {
    assert.equal(getVariantPrice(value, 'eur'), null)
  }
})

test('non-numeric, non-finite and negative amounts are hidden', () => {
  for (const amount of [undefined, null, '129.95', NaN, Infinity, -Infinity, -1]) {
    assert.equal(getVariantPrice(variant(amount), 'eur'), null, `invalid amount: ${String(amount)}`)
  }
})

test('missing, invalid or mismatched API currency is hidden', () => {
  for (const currency of [null, '', 'EU', 'EURO', '12$', 'ZZZ', 'usd']) {
    assert.equal(getVariantPrice(variant(129.95, currency), 'eur'), null)
  }
})

test('price requires valid regional currency context', () => {
  for (const currency of [null, undefined, '', 'EU', 'EURO', 'ZZZ']) {
    assert.equal(getVariantPrice(variant(129.95), currency), null)
  }
})

test('currency comparisons are case insensitive', () => {
  assert.equal(getVariantPrice(variant(25, 'EUR'), 'eur').currencyCode, 'EUR')
  assert.equal(getVariantPrice(variant(25, 'eur'), 'EUR').currencyCode, 'EUR')
})

test('catalog uses minimum valid regional amount and marks a range', () => {
  const result = getProductPrice(product(variant(99), variant(39.5), variant(65)), 'eur')
  assert.equal(result.amount, 39.5)
  assert.equal(result.isRange, true)
})

test('catalog ignores missing, invalid and other-currency variants', () => {
  const result = getProductPrice(product(variant(1, 'usd'), variant(-1), {}, variant(90)), 'eur')
  assert.equal(result.amount, 90)
  assert.equal(result.isRange, false)
})

test('equal variant prices do not create a false price range', () => {
  const result = getProductPrice(product(variant(50), variant(50)), 'eur')
  assert.equal(result.amount, 50)
  assert.equal(result.isRange, false)
})

test('zero is the minimum when mixed with positive prices', () => {
  const result = getProductPrice(product(variant(20), variant(0)), 'eur')
  assert.equal(result.amount, 0)
  assert.equal(result.isRange, true)
})

test('missing product, empty variants and no valid regional prices return no price', () => {
  for (const value of [null, undefined, {}, product(), product({}, variant(1, 'usd'))]) {
    assert.equal(getProductPrice(value, 'eur'), null)
  }
})
