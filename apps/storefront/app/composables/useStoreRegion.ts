import type { HttpTypes } from "@medusajs/types";

export function useStoreRegion() {
  const { data: regions } = useNuxtData<HttpTypes.StoreRegion[]>("store-regions");

  const region = computed(() => regions.value?.[0] || null);

  return {
    region,
  };
}
