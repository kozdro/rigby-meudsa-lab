import type { HttpTypes } from "@medusajs/types";

export function useStoreRegion() {
  const { data: regions } = useNuxtData<HttpTypes.StoreRegion[]>("store-regions");

  const regionCookie = useCookie<string | null>("rigby-region-id", {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  const region = computed(
    () => regions.value?.find((item) => item.id === regionCookie.value) || regions.value?.[0] || null,
  );

  function selectRegion(id: string) {
    if (regions.value?.some((item) => item.id === id)) regionCookie.value = id;
  }

  return {
    regions,
    region,
    selectRegion,
  };
}
