<script setup lang="ts">
const { $medusa } = useNuxtApp();
const { region } = useStoreRegion();
const route = useRoute();

const limit = 12;
const page = computed(() => Math.max(1, Number.parseInt(String(route.query.page || "1"), 10) || 1));
const key = computed(() => `products:${region.value?.id || "no-region"}:${page.value}`);

const { data, status, error, refresh } = await useAsyncData(
  key,
  async () => {
    const regionId = region.value?.id;

    return await $medusa.store.product.list({
      limit,
      offset: (page.value - 1) * limit,
      ...(regionId ? { region_id: regionId, fields: "*variants.calculated_price" } : {}),
    });
  },
  { lazy: true },
);

useSeoMeta({
  title: "Kolekcja",
  description: "Odkryj kolekcję Rigby. Przeglądaj produkty, poznaj dostępne warianty i zapisz swoje ulubione.",
});
</script>

<template>
  <main
    id="main-content"
    class="site-container pb-20 md:pb-28"
    :data-region-id="region?.id"
  >
    <section
      aria-labelledby="catalog-heading"
      class="flex flex-col justify-between gap-8 pt-12 pb-10 md:flex-row md:items-end md:pt-20 md:pb-14"
    >
      <div>
        <p class="eyebrow mb-5 text-accent">Rigby / Kolekcja</p>
        <h1
          id="catalog-heading"
          class="page-heading"
        >
          Codzienność.<br>W dobrym stylu.
        </h1>
      </div>
      <div class="max-w-72 pb-1">
        <p class="text-sm leading-7 text-muted">
          Odkryj kolekcję. Przyjrzyj się detalom.<br>Zapisz to, do czego chcesz wrócić.
        </p>
        <a
          href="#products"
          class="text-link mt-3"
        >
          Przeglądaj produkty<StoreIcon name="arrow" />
        </a>
      </div>
    </section>
    <section
      id="products"
      aria-labelledby="products-heading"
      class="scroll-mt-28"
    >
      <div class="mb-7 flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
        <div class="flex items-center gap-3">
          <h2
            id="products-heading"
            class="text-sm font-medium"
          >
            Wszystkie produkty
          </h2>
          <span
            v-if="status === 'success'"
            class="text-xs text-muted"
          >
            ({{ data?.count || 0 }})
          </span
          >
        </div>
        <RegionSelector />
      </div>
      <div
        v-if="status === 'pending'"
        role="status"
        aria-live="polite"
      >
        <p class="mb-5 text-sm text-muted">Ładowanie produktów...</p>
        <div
          class="product-grid"
          aria-hidden="true"
        >
          <div
            v-for="index in 4"
            :key="index"
          >
            <div class="aspect-3/4 bg-surface" />
            <div class="mt-5 h-3 w-2/3 bg-line" />
            <div class="mt-3 h-3 w-1/3 bg-line" />
          </div>
        </div>
      </div>
      <div
        v-else-if="error"
        class="state-panel"
        role="alert"
      >
        <h2>Nie udało się pobrać kolekcji.</h2>
        <p>Spróbuj ponownie za chwilę.</p>
        <button
          type="button"
          class="button-secondary"
          @click="refresh()"
        >
          Spróbuj ponownie
        </button>
      </div>
      <div
        v-else-if="!data?.products.length"
        class="state-panel"
      >
        <h2>Brak dostępnych produktów.</h2>
        <p>Wróć tutaj później, aby sprawdzić kolekcję.</p>
        <NuxtLink
          v-if="page > 1"
          to="/"
          class="button-secondary"
        >
          Pierwsza strona kolekcji
        </NuxtLink>
      </div>
      <template v-else>
        <ul class="product-grid">
          <li
            v-for="(product, index) in data.products"
            :key="product.id"
            class="min-w-0"
          >
            <ProductCard
              :product="product"
              :eager="index < 2"
            />
          </li>
        </ul>
        <nav
          v-if="data.count > limit || page > 1"
          aria-label="Strony kolekcji"
          class="mt-12 flex flex-wrap items-center justify-center gap-5 border-t border-line pt-8"
        >
          <NuxtLink
            v-if="page > 1"
            :to="{ query: { page: page - 1 } }"
            class="button-secondary"
          >
            Poprzednia
          </NuxtLink>
          <span class="text-sm text-muted">Strona {{ page }}</span>
          <NuxtLink
            v-if="page * limit < data.count"
            :to="{ query: { page: page + 1 } }"
            class="button-secondary"
          >
            Następna
            <StoreIcon name="arrow" />
          </NuxtLink>
        </nav>
        <div
          v-else
          class="mt-14 flex items-center gap-5 text-muted"
        >
          <span class="h-px flex-1 bg-line" />
          <p class="eyebrow">Twoja kolekcja zaczyna się tutaj</p>
          <span class="h-px flex-1 bg-line" />
        </div>
      </template>
    </section>
  </main>
</template>
