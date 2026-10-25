import { assertSameOrigin } from "../../utils/customer";
import { ownedCart, cartDetails, cartError } from "../../utils/cart";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const body = await readBody(event);
  if (
    typeof body?.variant_id !== "string" ||
    !body.variant_id ||
    !Number.isSafeInteger(body.quantity) ||
    body.quantity < 1 ||
    body.quantity > 100
  ) {
    throw createError({ statusCode: 400, message: "Wybierz wariant i ilość od 1 do 100." });
  }
  try {
    const { sdk, cart } = await ownedCart(event, true);
    if (!cart) throw createError({ statusCode: 502, message: "Nie udało się utworzyć koszyka." });
    const result = await sdk.store.cart.createLineItem(cart.id, {
      variant_id: body.variant_id,
      quantity: body.quantity,
    });
    return await cartDetails(sdk, result.cart);
  } catch (error) {
    return cartError(event, error);
  }
});
