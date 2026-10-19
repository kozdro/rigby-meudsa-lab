import type { WishlistResponse } from "../../../shared/types/wishlist";
import { customerSdk, customerError } from "../../utils/customer";

export default defineEventHandler(async (event) => {
  try {
    const sdk = await customerSdk(event);
    return await sdk.client.fetch<WishlistResponse>("/store/wishlist");
  } catch (error) {
    return customerError(event, error);
  }
});
