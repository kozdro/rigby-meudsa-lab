import { customerSdk, customerSummary, medusaStatus, customerError, clearCustomerCookie } from "../../utils/customer";

export default defineEventHandler(async (event) => {
  try {
    const sdk = await customerSdk(event);
    const { customer } = await sdk.store.customer.retrieve();
    return { customer: customerSummary(customer) };
  } catch (error) {
    if (medusaStatus(error) === 401) {
      clearCustomerCookie(event);
      return { customer: null };
    }
    return customerError(event, error);
  }
});
