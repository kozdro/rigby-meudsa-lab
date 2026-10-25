import type { H3Event } from "h3";
import type { HttpTypes } from "@medusajs/types";
import { customerSdk, medusaStatus, customerError } from "./customer";

const cartCookie = "rigby_cart_id";

export function clearCartCookie(event: H3Event) {
  deleteCookie(event, cartCookie, { path: "/" });
}

export function cartError(event: H3Event, error: unknown): never {
  if (error && typeof error === "object" && "statusCode" in error) throw error;
  const status = medusaStatus(error);
  if ([400, 409, 422].includes(status)) {
    throw createError({
      statusCode: status,
      message:
        "Nie udało się zaktualizować koszyka. Sprawdź dostępność produktów, adres i saldo punktów, a następnie spróbuj ponownie.",
    });
  }
  return customerError(event, error);
}

function cartCustomerId(cart: HttpTypes.StoreCart) {
  // Medusa 2.21.2 includes customer.id in its default Store Cart fields, while
  // StoreCart's published type only declares customer_id (which isn't selected).
  return (cart as HttpTypes.StoreCart & { customer?: Pick<HttpTypes.StoreCustomer, "id"> }).customer?.id;
}

export async function ownedCart(event: H3Event, create = false, allowCompleted = false) {
  const sdk = await customerSdk(event);
  const { customer } = await sdk.store.customer.retrieve();
  const id = getCookie(event, cartCookie);
  let cart: HttpTypes.StoreCart | null = null;
  if (id) {
    try {
      cart = (await sdk.store.cart.retrieve(id)).cart;
    } catch (error) {
      if (medusaStatus(error) !== 404) throw error;
      clearCartCookie(event);
    }
    if (cart && cartCustomerId(cart) !== customer.id) {
      clearCartCookie(event);
      throw createError({ statusCode: 403, message: "Ten koszyk nie należy do Twojego konta." });
    }
    if (cart?.completed_at && !allowCompleted) {
      throw createError({
        statusCode: 409,
        message: "Ten koszyk został zamówiony. Otwórz koszyk, aby potwierdzić zamówienie.",
      });
    }
    if (cart && cart.currency_code !== "eur") {
      throw createError({ statusCode: 400, message: "Program punktowy jest dostępny tylko w regionie EUR." });
    }
  }
  if (!cart && create) {
    const { regions } = await sdk.store.region.list({ limit: 100 });
    const region = regions.find((item) => item.currency_code === "eur");
    if (!region) throw createError({ statusCode: 503, message: "Region EUR jest chwilowo niedostępny." });
    cart = (await sdk.store.cart.create({ region_id: region.id, email: customer.email })).cart;
    if (cartCustomerId(cart) !== customer.id) {
      throw createError({ statusCode: 502, message: "Nie udało się przypisać koszyka do konta." });
    }
    setCookie(event, cartCookie, cart.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: getRequestURL(event).protocol === "https:",
      path: "/",
    });
  }
  return { sdk, cart, customer };
}

export async function requiredCart(event: H3Event, allowCompleted = false) {
  const result = await ownedCart(event, false, allowCompleted);
  if (!result.cart) throw createError({ statusCode: 404, message: "Koszyk jest pusty. Dodaj produkt." });
  if (!result.cart.region_id) throw createError({ statusCode: 502, message: "Brak regionu koszyka." });
  return { ...result, cart: { ...result.cart, region_id: result.cart.region_id } };
}

export async function cartDetails(sdk: Awaited<ReturnType<typeof customerSdk>>, cart: HttpTypes.StoreCart | null) {
  if (!cart) return { cart: null, shipping_options: [], payment_providers: [] };
  if (!cart.region_id) throw createError({ statusCode: 502, message: "Brak regionu koszyka." });
  if (cart.completed_at) return { cart, shipping_options: [], payment_providers: [] };
  // The native mutation's returned cart is its acknowledgment. Optional checkout
  // reads must not turn an already-committed add/update into a retryable failure.
  const [shipping, payment] = await Promise.allSettled([
    cart.shipping_address?.country_code && cart.items?.length
      ? sdk.store.fulfillment.listCartOptions({ cart_id: cart.id })
      : Promise.resolve({ shipping_options: [] }),
    sdk.store.payment.listPaymentProviders({ region_id: cart.region_id }),
  ]);
  return {
    cart,
    shipping_options: shipping.status === "fulfilled" ? shipping.value.shipping_options : [],
    payment_providers:
      payment.status === "fulfilled"
        ? payment.value.payment_providers.filter((provider) => provider.id === "pp_system_default")
        : [],
    details_error: shipping.status === "rejected" || payment.status === "rejected",
  };
}
