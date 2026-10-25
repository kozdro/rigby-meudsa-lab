import { ownedCart, cartDetails, cartError } from "../../utils/cart";

export default defineEventHandler(async (event) => {
  try {
    const { sdk, cart } = await ownedCart(event, false, true);
    return await cartDetails(sdk, cart);
  } catch (error) {
    return cartError(event, error);
  }
});
