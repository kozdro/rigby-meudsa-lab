import { assertSameOrigin } from "../../utils/customer";
import { requiredCart, cartDetails, cartError } from "../../utils/cart";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const body = await readBody(event);
  if (!Number.isSafeInteger(body?.points) || body.points < 100 || body.points % 100 !== 0)
    throw createError({ statusCode: 400, message: "Wykorzystaj pełne bloki po 100 punktów." });
  try {
    const { sdk, cart } = await requiredCart(event);
    await sdk.client.fetch(`/store/carts/${cart.id}/loyalty-points`, { method: "POST", body: { points: body.points } });
    return await cartDetails(sdk, (await sdk.store.cart.retrieve(cart.id)).cart);
  } catch (error) {
    return cartError(event, error);
  }
});
