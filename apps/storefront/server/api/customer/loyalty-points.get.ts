import { customerSdk, customerError } from "../../utils/customer";

export default defineEventHandler(async (event) => {
  try {
    const sdk = await customerSdk(event);
    return await sdk.client.fetch<{ points: number }>("/store/customers/me/loyalty-points");
  } catch (error) {
    return customerError(event, error);
  }
});
