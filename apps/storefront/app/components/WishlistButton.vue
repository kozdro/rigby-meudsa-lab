<script setup lang="ts">
const props = withDefaults(defineProps<{ productId: string; title: string; iconOnly?: boolean }>(), {
  iconOnly: false,
});

const { state, isSaved, toggle } = useWishlist();

const saved = computed(() => isSaved(props.productId));
</script>

<template>
  <button
    type="button"
    data-testid="wishlist-toggle"
    :data-product-id="productId"
    :aria-label="`${saved ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}: ${title}`"
    :aria-pressed="saved"
    :aria-busy="state.pendingProduct === productId"
    :class="
      iconOnly
        ? 'inline-flex size-11 items-center justify-center rounded-full border border-line bg-canvas hover:border-accent hover:text-accent'
        : 'button-secondary w-full'
    "
    :disabled="state.authPending || !!state.pendingProduct || (!!state.customer && !state.loaded)"
    @click="toggle(productId)"
  >
    <StoreIcon
      name="heart"
      :class="{ 'fill-accent text-accent': saved }"
    />
    <span :class="{ 'sr-only': iconOnly }">
      {{ state.pendingProduct === productId ? "Zapisywanie…" : saved ? "Usuń z ulubionych" : "Dodaj do ulubionych" }}
    </span>
  </button>
</template>
