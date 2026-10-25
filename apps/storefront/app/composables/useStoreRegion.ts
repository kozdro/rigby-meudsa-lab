import type { HttpTypes } from "@medusajs/types";

export function useStoreRegion() {
  const { data: regions } = useNuxtData<HttpTypes.StoreRegion[]>("store-regions");

  const region = computed(() => regions.value?.find((item) => item.currency_code === "eur") || null);

  return {
    region,
  };
}
