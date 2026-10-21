<script setup lang="ts">
import type { HttpTypes } from "@medusajs/types";
import { getProductPrice } from "~/utils/pricing";

const props = withDefaults(
  defineProps<{
    product: HttpTypes.StoreProduct;
    eager?: boolean;
  }>(),
  { eager: false },
);

const { region } = useStoreRegion();

const price = computed(() => getProductPrice(props.product, region.value?.currency_code));
</script>

<template>
  <article
    data-testid="product-card"
    :data-product-id="product.id"
    class="group min-w-0"
  >
    <div class="relative">
      <NuxtLink
        v-if="product.handle"
        :to="`/products/${encodeURIComponent(product.handle)}`"
        data-testid="product-link"
        :aria-label="`Zobacz produkt: ${product.title}`"
        class="block"
      >
        <ProductImage
          :src="product.thumbnail || product.images?.[0]?.url"
          :alt="product.title"
          :eager="eager"
        />
      </NuxtLink>
      <ProductImage
        v-else
        :src="product.thumbnail || product.images?.[0]?.url"
        :alt="product.title"
        :eager="eager"
      />
      <WishlistButton
        :product-id="product.id"
        :title="product.title"
        icon-only
        class="absolute top-2 right-2 md:top-3 md:right-3"
      />
    </div>
    <div class="pt-4">
      <p
        v-if="product.collection?.title"
        class="eyebrow mb-1 text-muted"
      >
        {{ product.collection.title }}
      </p>
      <h2 class="mb-2 text-sm leading-snug font-medium md:text-base">
        <NuxtLink
          v-if="product.handle"
          :to="`/products/${encodeURIComponent(product.handle)}`"
          class="inline-flex min-h-11 items-center hover:text-accent"
        >
          {{ product.title }}
        </NuxtLink>
        <span v-else>{{ product.title }}</span>
      </h2>
      <ProductPrice :price="price" />
    </div>
  </article>
</template>
