import { assertSameOrigin } from "../../utils/customer";
import { requiredCart, cartDetails, cartError } from "../../utils/cart";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const body = await readBody(event);
  const fields = ["first_name", "last_name", "address_1", "city", "postal_code", "country_code"] as const;
  if (!body || fields.some((key) => typeof body[key] !== "string" || !body[key].trim() || body[key].length > 200)) {
    throw createError({ statusCode: 400, message: "Uzupełnij wszystkie pola adresu dostawy." });
  }
  try {
    const { sdk, cart, customer } = await requiredCart(event);
    const country = body.country_code.toLowerCase();
    if (!cart.region?.countries?.some((item) => item.iso_2 === country)) {
      throw createError({ statusCode: 400, message: "Wybierz kraj z regionu EUR." });
    }
    const address = {
      first_name: body.first_name.trim(),
      last_name: body.last_name.trim(),
      address_1: body.address_1.trim(),
      city: body.city.trim(),
      postal_code: body.postal_code.trim(),
      country_code: country,
    };
    const result = await sdk.store.cart.update(cart.id, {
      email: customer.email,
      shipping_address: address,
      billing_address: address,
    });
    return await cartDetails(sdk, result.cart);
  } catch (error) {
    return cartError(event, error);
  }
});
