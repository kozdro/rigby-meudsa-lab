import type { HttpTypes } from "@medusajs/types";

export interface DisplayPrice {
  amount: number;
  currencyCode: string;
  formatted: string;
}

export function getVariantPrice(
  variant: Pick<HttpTypes.StoreProductVariant, "calculated_price"> | null | undefined,
  currencyCode: string | null | undefined,
): DisplayPrice | null {
  const price = variant?.calculated_price;
  const currency = currencyCode?.toUpperCase();
  const amount = price?.calculated_amount;
  if (
    !currency ||
    !/^[A-Z]{3}$/.test(currency) ||
    price?.currency_code?.toUpperCase() !== currency ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount < 0
  )
    return null;
  try {
    if (!Intl.supportedValuesOf("currency").includes(currency)) return null;
    return {
      amount,
      currencyCode: currency,
      formatted: new Intl.NumberFormat("pl-PL", { style: "currency", currency }).format(amount),
    };
  } catch {
    return null;
  }
}

export function getProductPrice(
  product: Pick<HttpTypes.StoreProduct, "variants"> | null | undefined,
  currencyCode: string | null | undefined,
): (DisplayPrice & { isRange: boolean }) | null {
  const prices = (product?.variants || [])
    .map((variant) => getVariantPrice(variant, currencyCode))
    .filter((price): price is DisplayPrice => price !== null);
  const minimum = prices.reduce<DisplayPrice | null>(
    (result, price) => (!result || price.amount < result.amount ? price : result),
    null,
  );
  return minimum ? { ...minimum, isRange: prices.some((price) => price.amount !== minimum.amount) } : null;
}
