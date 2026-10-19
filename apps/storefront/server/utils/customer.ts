import Medusa from "@medusajs/js-sdk";
import type { H3Event } from "h3";
import type { CustomerSummary } from "../../shared/types/wishlist";

const cookieName = "rigby_customer_session";

export function privateResponse(event: H3Event) {
  setResponseHeader(event, "Cache-Control", "private, no-store");
}

export function assertSameOrigin(event: H3Event) {
  privateResponse(event);
  const origin = getRequestHeader(event, "origin");
  if (!origin || origin !== getRequestURL(event).origin) {
    throw createError({ statusCode: 403, message: "Niedozwolone pochodzenie żądania." });
  }
}

export function clearCustomerCookie(event: H3Event) {
  deleteCookie(event, cookieName, { path: "/" });
}

export function setCustomerCookie(event: H3Event, token: string) {
  setCookie(event, cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getRequestURL(event).protocol === "https:",
    path: "/",
  });
}

export async function customerSdk(event: H3Event, authenticated = true) {
  privateResponse(event);
  const config = useRuntimeConfig(event);
  const sdk = new Medusa({
    baseUrl: config.public.medusaBackendUrl,
    publishableKey: config.public.medusaPublishableKey,
    auth: { type: "jwt", jwtTokenStorageMethod: "memory" },
  });
  if (authenticated) {
    const token = getCookie(event, cookieName);
    if (!token) {
      throw createError({ statusCode: 401, message: "Zaloguj się, aby korzystać z ulubionych." });
    }
    await sdk.client.setToken(token);
  }
  return sdk;
}

export function customerSummary(customer: CustomerSummary): CustomerSummary {
  return { id: customer.id, email: customer.email, first_name: customer.first_name };
}

export function medusaStatus(error: unknown) {
  if (typeof error !== "object" || !error) return 502;
  const status = "status" in error ? error.status : "statusCode" in error ? error.statusCode : 502;
  return typeof status === "number" ? status : 502;
}

export function customerError(event: H3Event, error: unknown): never {
  const status = medusaStatus(error);
  if (status === 401) clearCustomerCookie(event);
  const messages: Record<number, string> = {
    400: "Nieprawidłowe dane żądania.",
    401: "Sesja wygasła. Zaloguj się ponownie.",
    403: "Brak dostępu do tej operacji.",
    404: "Produkt nie jest już dostępny.",
    409: "Operacja jest w toku. Spróbuj ponownie.",
    429: "Zbyt wiele prób. Spróbuj ponownie później.",
  };
  throw createError({
    statusCode: status >= 400 && status < 500 ? status : 502,
    message: messages[status] || "Nie udało się połączyć ze sklepem. Spróbuj ponownie.",
  });
}
