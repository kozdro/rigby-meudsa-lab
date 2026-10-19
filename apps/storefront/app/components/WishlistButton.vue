<script setup lang="ts">
const props = defineProps<{ productId: string, title: string }>()
const { state, isSaved, toggle } = useWishlist()
const saved = computed(() => isSaved(props.productId))
</script>

<template>
  <button
    type="button"
    data-testid="wishlist-toggle"
    :data-product-id="productId"
    :aria-label="`${saved ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}: ${title}`"
    :aria-pressed="saved"
    :disabled="state.authPending || !!state.pendingProduct || (!!state.customer && !state.loaded)"
    @click="toggle(productId)"
  >
    {{ state.pendingProduct === productId ? 'Zapisywanie…' : saved ? 'Usuń z ulubionych' : 'Dodaj do ulubionych' }}
  </button>
</template>
