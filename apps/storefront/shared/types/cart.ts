import type { HttpTypes } from "@medusajs/types";

export interface CartResponse {
  cart: HttpTypes.StoreCart | null;
  shipping_options: HttpTypes.StoreCartShippingOption[];
  payment_providers: HttpTypes.StorePaymentProvider[];
  details_error?: boolean;
}
