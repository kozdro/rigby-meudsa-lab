import { assertSameOrigin } from "../../utils/customer";
import { requiredCart, cartDetails, cartError } from "../../utils/cart";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const body = await readBody(event);
  if (typeof body?.option_id !== "string" || !body.option_id)
    throw createError({ statusCode: 400, message: "Wybierz sposób dostawy." });
  try {
    const { sdk, cart } = await requiredCart(event);
    const { shipping_options } = await sdk.store.fulfillment.listCartOptions({ cart_id: cart.id });
    if (!shipping_options.some((option) => option.id === body.option_id))
      throw createError({ statusCode: 400, message: "Ten sposób dostawy nie jest dostępny." });
    const result = await sdk.store.cart.addShippingMethod(cart.id, { option_id: body.option_id });
    return await cartDetails(sdk, result.cart);
  } catch (error) {
    return cartError(event, error);
  }
});
