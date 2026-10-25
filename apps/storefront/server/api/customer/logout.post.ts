import { assertSameOrigin, clearCustomerCookie } from "../../utils/customer";
import { clearCartCookie } from "../../utils/cart";

export default defineEventHandler((event) => {
  assertSameOrigin(event);
  clearCustomerCookie(event);
  clearCartCookie(event);
  return { customer: null };
});
