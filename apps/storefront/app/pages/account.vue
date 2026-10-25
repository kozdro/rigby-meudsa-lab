<script setup lang="ts">
const { state } = useWishlist();
const requestFetch = useRequestFetch();
const { data, status, error, refresh } = await useAsyncData(
  "loyalty-points",
  async () => {
    if (!state.value.customer) return null;
    return requestFetch<{ points: number }>("/api/customer/loyalty-points");
  },
  { watch: [() => state.value.customer?.id] },
);

useSeoMeta({ title: "Twoje konto", robots: "noindex, nofollow" });
</script>

<template>
  <main
    id="main-content"
    class="site-container py-14 md:py-24"
  >
    <p class="eyebrow mb-5 text-accent">Rigby / Twoje konto</p>
    <h1 class="page-heading">Twoje punkty.</h1>
    <div
      v-if="!state.customer"
      class="state-panel mt-10"
    >
      <p>Zaloguj się, aby sprawdzić saldo punktów.</p>
      <NuxtLink
        to="/login"
        class="button-primary"
        >Zaloguj się</NuxtLink
      >
    </div>
    <section
      v-else
      class="mt-10 max-w-xl border border-line p-7"
      aria-labelledby="balance-heading"
    >
      <h2
        id="balance-heading"
        class="text-2xl tracking-tight"
      >
        Program lojalnościowy
      </h2>
      <p
        v-if="status === 'pending'"
        role="status"
        class="mt-5"
      >
        Ładowanie salda…
      </p>
      <p
        v-else-if="error"
        role="alert"
        class="feedback mt-5"
      >
        Nie udało się pobrać salda. Spróbuj ponownie.
      </p>
      <p
        v-else-if="data"
        class="mt-5 text-xl"
        aria-live="polite"
      >
        Saldo: <strong data-testid="account-points">{{ data.points }}</strong> pkt
      </p>
      <p class="mt-5 text-sm leading-7 text-muted">
        Za każde pełne 1 € wartości produktów po rabatach, z VAT i bez dostawy, otrzymujesz 1 punkt po potwierdzeniu
        płatności. Każde 100 punktów możesz wymienić na 10 € rabatu w koszyku.
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="refresh-points"
          class="button-secondary"
          :disabled="status === 'pending'"
          @click="refresh()"
        >
          Odśwież saldo
        </button>
        <NuxtLink
          to="/cart"
          class="button-primary"
          >Przejdź do koszyka</NuxtLink
        >
      </div>
    </section>
  </main>
</template>
