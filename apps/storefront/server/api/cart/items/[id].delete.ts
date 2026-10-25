import { assertSameOrigin } from "../../../utils/customer";
import { requiredCart, cartDetails, cartError } from "../../../utils/cart";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const id = getRouterParam(event, "id");
  try {
    const { sdk, cart } = await requiredCart(event);
    if (!id || !cart.items?.some((item) => item.id === id))
      throw createError({ statusCode: 404, message: "Nie znaleziono pozycji koszyka." });
    await sdk.store.cart.deleteLineItem(cart.id, id);
    return await cartDetails(sdk, (await sdk.store.cart.retrieve(cart.id)).cart);
  } catch (error) {
    return cartError(event, error);
  }
});
