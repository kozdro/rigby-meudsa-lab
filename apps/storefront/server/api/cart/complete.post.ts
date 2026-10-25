import { assertSameOrigin } from "../../utils/customer";
import { requiredCart, cartError } from "../../utils/cart";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const body = await readBody(event);
  if (body?.provider_id !== "pp_system_default")
    throw createError({ statusCode: 400, message: "Wybierz płatność ręczną." });
  try {
    const { sdk, cart } = await requiredCart(event, true);
    if (!cart.items?.length || !cart.shipping_address?.country_code || !cart.shipping_methods?.length) {
      throw createError({ statusCode: 400, message: "Uzupełnij koszyk, adres i sposób dostawy." });
    }
    if (!cart.completed_at) {
      const { payment_providers } = await sdk.store.payment.listPaymentProviders({ region_id: cart.region_id });
      if (!payment_providers.some((provider) => provider.id === body.provider_id))
        throw createError({ statusCode: 503, message: "Płatność ręczna jest chwilowo niedostępna." });
      // Initialize only after product, tax, shipping and promotion totals are final.
      await sdk.store.payment.initiatePaymentSession(cart, { provider_id: body.provider_id });
    }
    const result = await sdk.store.cart.complete(cart.id);
    if (result.type !== "order") {
      throw createError({
        statusCode: 409,
        message:
          "Nie udało się złożyć zamówienia. Koszyk został zachowany. Sprawdź saldo i dostępność produktów, a następnie spróbuj ponownie.",
      });
    }
    return { order: result.order };
  } catch (error) {
    return cartError(event, error);
  }
});
