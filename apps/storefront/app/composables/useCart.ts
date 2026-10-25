import type { CartResponse } from "../../shared/types/cart";

export function useCart() {
  const requestFetch = useRequestFetch();
  const { state: customer } = useWishlist();
  const state = useState("shopping-cart", () => ({
    response: null as CartResponse | null,
    pending: false,
    error: "",
    notice: "",
    uncertain: false,
  }));
  const count = computed(() => state.value.response?.cart?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0);

  function reset() {
    state.value.response = null;
    state.value.error = "";
    state.value.notice = "";
    state.value.uncertain = false;
    clearNuxtData(["current-cart", "loyalty-points"]);
  }

  async function mutate(path: string, method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>) {
    if (state.value.pending || customer.value.authPending) return false;
    if (!customer.value.customer) {
      await navigateTo("/login");
      return false;
    }
    const owner = customer.value.customer.id;
    state.value.pending = true;
    state.value.error = "";
    state.value.notice = "";
    try {
      const response = await requestFetch<CartResponse>(path, { method, ...(body ? { body } : {}) });
      if (customer.value.customer?.id !== owner) return false;
      state.value.response = response;
      state.value.uncertain = false;
      return true;
    } catch (error) {
      if (customer.value.customer?.id === owner) {
        const failure = error as { statusCode?: number; data?: { message?: string } };
        const ambiguous = !failure.statusCode || failure.statusCode >= 500;
        if (ambiguous) {
          state.value.uncertain = true;
          try {
            const current = await requestFetch<CartResponse>("/api/cart");
            if (customer.value.customer?.id === owner) state.value.response = current;
          } catch {
            /* Keep the last known cart and require reconciliation on its page. */
          }
          state.value.error =
            "Nie otrzymano potwierdzenia zmiany. Otwórz koszyk i sprawdź aktualne ilości przed kolejną zmianą.";
        } else {
          state.value.error = failure.data?.message || "Nie udało się zaktualizować koszyka. Sprawdź aktualne dane.";
        }
      }
      return false;
    } finally {
      state.value.pending = false;
    }
  }

  async function add(variantId: string, quantity: number) {
    if (state.value.uncertain) {
      await navigateTo("/cart");
      return;
    }
    if (await mutate("/api/cart/items", "POST", { variant_id: variantId, quantity })) {
      state.value.notice = "Dodano produkt do koszyka.";
    }
  }

  return { state, count, reset, mutate, add };
}
