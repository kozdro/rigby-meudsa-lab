import type { CustomerSession, CustomerSummary, WishlistResponse } from "../../shared/types/wishlist";

export function useWishlist() {
  const requestFetch = useRequestFetch();

  const state = useState("customer-wishlist", () => ({
    customer: null as CustomerSummary | null,
    wishlist: null as WishlistResponse["wishlist"],
    loaded: false,
    authPending: false,
    pendingProduct: "",
    error: "",
    notice: "",
    revision: 0,
  }));

  function reset() {
    state.value.revision++;
    state.value.customer = null;
    state.value.wishlist = null;
    state.value.loaded = false;
    state.value.error = "";
    state.value.notice = "";

    clearNuxtData("wishlist-bootstrap");
  }

  function reportError(error: unknown) {
    const failure = error as { statusCode?: number; data?: { message?: string } };

    if (failure.statusCode === 401) reset();

    state.value.error = failure.data?.message || "Nie udało się wykonać operacji. Spróbuj ponownie.";
  }

  async function reload() {
    if (!state.value.customer || state.value.authPending || state.value.pendingProduct) return;

    const revision = state.value.revision;

    state.value.pendingProduct = "refresh";
    state.value.error = "";

    try {
      const response = await requestFetch<WishlistResponse>("/api/wishlist");

      if (state.value.revision !== revision) return;

      state.value.wishlist = response.wishlist;
      state.value.loaded = true;
    } catch (error) {
      if (state.value.revision === revision) reportError(error);
    } finally {
      state.value.pendingProduct = "";
    }
  }

  async function login(email: string, password: string) {
    if (state.value.authPending || state.value.pendingProduct) return false;

    reset();

    state.value.authPending = true;

    try {
      const response = await requestFetch<CustomerSession>("/api/customer/login", {
        method: "POST",
        body: { email, password },
      });

      state.value.customer = response.customer;
    } catch (error) {
      reportError(error);

      return false;
    } finally {
      state.value.authPending = false;
    }

    await reload();

    return !!state.value.customer;
  }

  async function logout() {
    if (state.value.authPending || state.value.pendingProduct) return;

    state.value.authPending = true;

    try {
      await requestFetch("/api/customer/logout", { method: "POST" });
      reset();
      await navigateTo("/login");
    } catch (error) {
      reportError(error);
    } finally {
      state.value.authPending = false;
    }
  }

  const items = computed(() => state.value.wishlist?.items || []);
  const isSaved = (productId: string) => items.value.some((item) => item.product_id === productId);

  async function toggle(productId: string) {
    if (!state.value.customer) {
      await navigateTo("/login");
      return;
    }

    if (!state.value.loaded || state.value.authPending || state.value.pendingProduct) return;

    const revision = state.value.revision;
    const saved = isSaved(productId);

    state.value.pendingProduct = productId;
    state.value.error = "";
    state.value.notice = "";

    try {
      const response = saved
        ? await requestFetch<WishlistResponse>(`/api/wishlist/items/${encodeURIComponent(productId)}`, {
            method: "DELETE",
          })
        : await requestFetch<WishlistResponse>("/api/wishlist/items", {
            method: "POST",
            body: { product_id: productId },
          });

      if (state.value.revision !== revision) return;

      state.value.wishlist = response.wishlist;
      state.value.notice = saved ? "Usunięto produkt z ulubionych." : "Dodano produkt do ulubionych.";
    } catch (error) {
      if (state.value.revision === revision) reportError(error);
    } finally {
      state.value.pendingProduct = "";
    }
  }

  return {
    state,
    items,
    isSaved,
    toggle,
    login,
    logout,
    reload,
  };
}
