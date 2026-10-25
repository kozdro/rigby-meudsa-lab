import { assertSameOrigin } from "../../utils/customer";
import { requiredCart, cartDetails, cartError } from "../../utils/cart";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  try {
    const { sdk, cart } = await requiredCart(event);
    await sdk.client.fetch(`/store/carts/${cart.id}/loyalty-points`, { method: "DELETE" });
    return await cartDetails(sdk, (await sdk.store.cart.retrieve(cart.id)).cart);
  } catch (error) {
    return cartError(event, error);
  }
});
