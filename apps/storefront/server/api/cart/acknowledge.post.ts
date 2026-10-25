import { assertSameOrigin } from "../../utils/customer";
import { requiredCart, clearCartCookie, cartError } from "../../utils/cart";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const body = await readBody(event);
  if (typeof body?.cart_id !== "string" || !body.cart_id)
    throw createError({ statusCode: 400, message: "Brak identyfikatora potwierdzonego koszyka." });
  try {
    const { cart } = await requiredCart(event, true);
    if (cart.id !== body.cart_id || !cart.completed_at)
      throw createError({ statusCode: 409, message: "Koszyk nie odpowiada potwierdzonemu zamówieniu." });
    clearCartCookie(event);
    return { acknowledged: true };
  } catch (error) {
    return cartError(event, error);
  }
});
