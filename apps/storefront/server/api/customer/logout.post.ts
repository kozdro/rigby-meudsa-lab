import { assertSameOrigin, clearCustomerCookie } from '../../utils/customer'

export default defineEventHandler((event) => {
  assertSameOrigin(event)
  clearCustomerCookie(event)
  return { customer: null }
})
