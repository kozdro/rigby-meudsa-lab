import type { WishlistResponse } from "../../../shared/types/wishlist";
import { assertSameOrigin, customerSdk, customerError } from "../../utils/customer";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const body: unknown = await readBody(event);
  if (
    !body ||
    typeof body !== "object" ||
    !("product_id" in body) ||
    typeof body.product_id !== "string" ||
    !body.product_id.trim() ||
    body.product_id.length > 255 ||
    Object.keys(body).some((key) => key !== "product_id")
  ) {
    throw createError({ statusCode: 400, message: "Podaj identyfikator produktu." });
  }
  try {
    const sdk = await customerSdk(event);
    return await sdk.client.fetch<WishlistResponse>("/store/wishlist/items", {
      method: "POST",
      body: { product_id: body.product_id },
    });
  } catch (error) {
    return customerError(event, error);
  }
});
