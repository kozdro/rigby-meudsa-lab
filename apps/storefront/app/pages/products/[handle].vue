<script setup lang="ts">
import { getProductPrice, getVariantPrice } from "~/utils/pricing";

definePageMeta({ key: (route) => String(route.params.handle) });

const { $medusa } = useNuxtApp();
const route = useRoute();
const { region } = useStoreRegion();

const key = computed(() => `product:${String(route.params.handle)}:${region.value?.id || "no-region"}`);

const {
  data: product,
  status,
  error,
  refresh,
} = await useAsyncData(
  key,
  async () => {
    const regionId = region.value?.id;
    const response = await $medusa.store.product.list({
      handle: String(route.params.handle),
      limit: 1,
      ...(regionId ? { region_id: regionId, fields: "*variants.calculated_price" } : {}),
    });

    return response.products[0] || null;
  },
  { lazy: true },
);

if (status.value === "success" && !product.value)
  throw createError({ statusCode: 404, statusMessage: "Nie znaleziono produktu" });

watch([status, product], () => {
  if (status.value === "success" && !product.value)
    showError({ statusCode: 404, statusMessage: "Nie znaleziono produktu" });
});

const selectedVariantId = ref("");
const selectedImage = ref("");

watch(
  product,
  (value) => {
    selectedVariantId.value = value?.variants?.[0]?.id || "";
    selectedImage.value = value?.thumbnail || value?.images?.[0]?.url || "";
  },
  { immediate: true },
);

const variant = computed(() => product.value?.variants?.find((item) => item.id === selectedVariantId.value));
const price = computed(() =>
  variant.value
    ? getVariantPrice(variant.value, region.value?.currency_code)
    : getProductPrice(product.value, region.value?.currency_code),
);
const images = computed(() => [
  ...new Set(
    [product.value?.thumbnail, ...(product.value?.images || []).map((image) => image.url)].filter(
      (url): url is string => !!url,
    ),
  ),
]);
const availability = computed(() => {
  if (!variant.value) return null;

  if (variant.value.manage_inventory === false || variant.value.allow_backorder === true) return "Dostępny";

  if (typeof variant.value.inventory_quantity === "number")
    return variant.value.inventory_quantity > 0 ? "Dostępny" : "Niedostępny";

  return null;
});

const productUrl = useRequestURL();

const canonical = computed(() => `${productUrl.origin}/products/${encodeURIComponent(String(route.params.handle))}`);

useSeoMeta({
  title: () => product.value?.title || "Produkt",
  description: () => product.value?.description || "Poznaj szczegóły produktu i dostępne warianty w kolekcji Rigby.",
  ogTitle: () => product.value?.title,
  ogDescription: () => product.value?.description || undefined,
  ogImage: () => product.value?.thumbnail || product.value?.images?.[0]?.url,
});

useHead(() => ({
  link: [{ rel: "canonical", href: canonical.value }],
  script:
    product.value && status.value === "success"
      ? [
          {
            type: "application/ld+json",
            innerHTML: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: product.value.title,
              description: product.value.description || undefined,
              image: images.value,
              sku: variant.value?.sku || undefined,
              ...(price.value
                ? {
                    offers: {
                      "@type": "Offer",
                      price: price.value.amount,
                      priceCurrency: price.value.currencyCode,
                      url: canonical.value,
                      ...(availability.value
                        ? {
                            availability:
                              availability.value === "Dostępny"
                                ? "https://schema.org/InStock"
                                : "https://schema.org/OutOfStock",
                          }
                        : {}),
                    },
                  }
                : {}),
            }).replace(/</g, "\\u003c"),
          },
        ]
      : [],
}));
</script>

<template>
  <main
    id="main-content"
    class="site-container pb-20 md:pb-28"
    :data-region-id="region?.id"
  >
    <div class="flex flex-wrap items-center justify-between gap-3 py-6 md:py-9">
      <NuxtLink
        to="/"
        class="text-link"
      >
        <StoreIcon
          name="arrow"
          class="rotate-180"
        />
        Wróć do kolekcji
      </NuxtLink>
    </div>
    <div
      v-if="status === 'pending'"
      role="status"
      aria-live="polite"
    >
      <p class="mb-5 text-sm text-muted">Ładowanie produktu...</p>
      <div
        class="grid gap-8 md:grid-cols-2"
        aria-hidden="true"
      >
        <div class="aspect-3/4 bg-surface" />
        <div class="py-10">
          <div class="h-8 w-3/4 bg-line" />
          <div class="mt-6 h-4 w-1/3 bg-line" />
          <div class="mt-12 h-28 bg-surface" />
        </div>
      </div>
    </div>
    <div
      v-else-if="error"
      class="state-panel"
      role="alert"
    >
      <h1 class="text-2xl tracking-tight">Nie udało się pobrać produktu.</h1>
      <p class="mt-3">Spróbuj ponownie za chwilę.</p>
      <button
        type="button"
        class="button-secondary"
        @click="refresh()"
      >
        Spróbuj ponownie
      </button>
    </div>
    <article
      v-else-if="product"
      data-testid="product-detail"
      :data-product-id="product.id"
      class="grid gap-9 md:grid-cols-[1.1fr_1fr] md:gap-12 lg:gap-20"
    >
      <div class="min-w-0">
        <ProductImage
          :src="selectedImage"
          :alt="product.title"
          eager
        />
        <div
          v-if="images.length > 1"
          class="mt-3 grid grid-cols-4 gap-3"
          aria-label="Galeria produktu"
        >
          <button
            v-for="(image, index) in images"
            :key="image"
            type="button"
            :aria-label="`Zdjęcie ${index + 1}: ${product.title}`"
            :aria-pressed="selectedImage === image"
            :class="selectedImage === image ? 'border-accent' : 'border-transparent hover:border-line'"
            class="min-h-11 border p-1"
            @click="selectedImage = image"
          >
            <ProductImage
              :src="image"
              :alt="`${product.title}, zdjęcie ${index + 1}`"
            />
          </button>
        </div>
      </div>
      <div class="min-w-0 py-2 md:py-7">
        <p class="eyebrow mb-5 text-accent">{{ product.collection?.title || "Rigby / Kolekcja" }}</p>
        <h1 class="text-4xl leading-[1.1] font-normal tracking-tigher wrap-break-word lg:text-5xl">
          {{ product.title }}
        </h1>
        <div
          class="mt-6 border-b border-line pb-7 **:data-[testid=product-price]:text-2xl"
          aria-live="polite"
        >
          <ProductPrice :price="price" />
        </div>
        <div
          v-if="product.variants?.length"
          class="mt-7"
        >
          <label
            for="product-variant"
            class="mb-3 block text-sm font-medium"
          >
            Wariant <span class="font-normal text-muted">/ {{ product.variants.length }}</span>
          </label>
          <select
            id="product-variant"
            v-model="selectedVariantId"
            data-testid="product-variant"
            class="form-input"
          >
            <option
              v-for="item in product.variants"
              :key="item.id"
              :value="item.id"
            >
              {{ item.title || item.options?.map((option) => option.value).join(" / ") || "Wariant" }}
            </option>
          </select>
          <p
            v-if="availability"
            class="mt-3 flex items-center gap-2 text-xs text-muted"
          >
            <span
              class="size-1.5 rounded-full"
              :class="availability === 'Dostępny' ? 'bg-accent' : 'bg-muted'"
            />
            {{ availability }}
          </p>
        </div>
        <div class="mt-7">
          <WishlistButton
            :product-id="product.id"
            :title="product.title"
          />
        </div>
        <div class="mt-10 border-t border-line pt-6">
          <h2 class="eyebrow mb-4">O produkcie</h2>
          <p
            v-if="product.description"
            class="text-sm leading-7 whitespace-pre-line text-muted"
          >
            {{ product.description }}
          </p>
          <p
            v-else
            class="text-sm leading-7 text-muted"
          >
            Opis produktu nie jest obecnie dostępny.
          </p>
        </div>
        <dl
          v-if="product.material || variant?.sku"
          class="mt-7 space-y-3 border-t border-line pt-6 text-xs"
        >
          <div
            v-if="product.material"
            class="flex gap-4"
          >
            <dt class="w-20 shrink-0 text-muted">Materiał</dt>
            <dd>{{ product.material }}</dd>
          </div>
          <div
            v-if="variant?.sku"
            class="flex gap-4"
          >
            <dt class="w-20 shrink-0 text-muted">SKU</dt>
            <dd class="break-all">{{ variant.sku }}</dd>
          </div>
        </dl>
      </div>
    </article>
  </main>
</template>
