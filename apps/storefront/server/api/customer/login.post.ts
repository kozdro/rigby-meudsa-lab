import {
  assertSameOrigin,
  clearCustomerCookie,
  customerSdk,
  customerSummary,
  customerError,
  medusaStatus,
  setCustomerCookie,
} from "../../utils/customer";
import { clearCartCookie } from "../../utils/cart";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const body: unknown = await readBody(event);
  if (
    !body ||
    typeof body !== "object" ||
    !("email" in body) ||
    !("password" in body) ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    !body.email.trim() ||
    !body.password ||
    body.email.length > 320 ||
    body.password.length > 4096
  ) {
    throw createError({ statusCode: 400, message: "Podaj adres e-mail i hasło." });
  }
  clearCustomerCookie(event);
  clearCartCookie(event);
  const sdk = await customerSdk(event, false);
  try {
    const result = await sdk.auth.login("customer", "emailpass", {
      email: body.email.trim(),
      password: body.password,
    });
    if (typeof result !== "string") {
      throw createError({
        statusCode: 422,
        message: "To konto wymaga dodatkowej weryfikacji, której ten formularz nie obsługuje.",
      });
    }
    const { customer } = await sdk.store.customer.retrieve();
    setCustomerCookie(event, result);
    return { customer: customerSummary(customer) };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 422) throw error;
    if (medusaStatus(error) === 401) {
      throw createError({ statusCode: 401, message: "Nieprawidłowy adres e-mail lub hasło." });
    }
    return customerError(event, error);
  }
});
