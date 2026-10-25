import { assertSameOrigin } from "../../../utils/customer";
import { requiredCart, cartDetails, cartError } from "../../../utils/cart";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const body = await readBody(event);
  const id = getRouterParam(event, "id");
  if (!id || !Number.isSafeInteger(body?.quantity) || body.quantity < 1 || body.quantity > 100) {
    throw createError({ statusCode: 400, message: "Podaj ilość od 1 do 100." });
  }
  try {
    const { sdk, cart } = await requiredCart(event);
    if (!cart.items?.some((item) => item.id === id))
      throw createError({ statusCode: 404, message: "Nie znaleziono pozycji koszyka." });
    const result = await sdk.store.cart.updateLineItem(cart.id, id, { quantity: body.quantity });
    return await cartDetails(sdk, result.cart);
  } catch (error) {
    return cartError(event, error);
  }
});
