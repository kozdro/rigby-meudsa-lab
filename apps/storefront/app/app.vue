<script setup lang="ts">
import type { CustomerSession, WishlistResponse } from "../shared/types/wishlist";

const { $medusa } = useNuxtApp();
const { state, reload } = useWishlist();
const requestFetch = useRequestFetch();
const { state: shopping, reset: resetCart } = useCart();

const { data: bootstrap, error: sessionError } = await useAsyncData("wishlist-bootstrap", async () => {
  const session = await requestFetch<CustomerSession>("/api/customer/session");

  if (!session.customer) return { customer: null, wishlist: null, loaded: false, error: "" };

  try {
    const response = await requestFetch<WishlistResponse>("/api/wishlist");

    return {
      customer: session.customer,
      wishlist: response.wishlist,
      loaded: true,
      error: "",
    };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;

    return {
      customer: status === 401 ? null : session.customer,
      wishlist: null,
      loaded: false,
      error:
        status === 401 ? "Sesja wygasła. Zaloguj się ponownie." : "Nie udało się pobrać ulubionych. Spróbuj ponownie.",
    };
  }
});

if (bootstrap.value) Object.assign(state.value, bootstrap.value);

if (sessionError.value) state.value.error = "Nie udało się sprawdzić sesji. Spróbuj odświeżyć stronę.";

const { data: initialCart } = await useAsyncData("current-cart", async () => {
  if (!state.value.customer) return null;
  return requestFetch<import("../shared/types/cart").CartResponse>("/api/cart");
});

shopping.value.response = initialCart.value || null;

watch(
  () => state.value.customer?.id,
  () => resetCart(),
);

const { error: regionError, refresh: refreshRegions } = await useAsyncData("store-regions", async () => {
  const response = await $medusa.store.region.list({ limit: 100 });

  return response.regions;
});

useHead({
  htmlAttrs: { lang: "pl" },
  titleTemplate: "%s | Rigby",
});
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <a
      href="#main-content"
      class="skip-link"
      >Przejdź do treści</a
    >
    <AppHeader />
    <div
      v-if="state.error || state.notice || regionError"
      class="site-container pt-5"
    >
      <div
        v-if="state.error"
        class="feedback"
        role="alert"
      >
        <p>{{ state.error }}</p>
        <button
          v-if="state.customer"
          type="button"
          class="text-link"
          :disabled="state.authPending || !!state.pendingProduct"
          @click="reload"
        >
          Spróbuj ponownie
        </button>
      </div>
      <p
        v-if="state.notice"
        class="feedback"
        role="status"
      >
        {{ state.notice }}
      </p>
      <div
        v-if="regionError"
        class="feedback mt-3"
        role="alert"
      >
        <p>Nie udało się pobrać regionów. Ceny są chwilowo niedostępne.</p>
        <button
          type="button"
          class="text-link"
          @click="refreshRegions()"
        >
          Spróbuj ponownie
        </button>
      </div>
    </div>
    <NuxtPage />
    <AppFooter />
  </div>
</template>
