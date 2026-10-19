<script setup lang="ts">
import type { DisplayPrice } from "~/utils/pricing";

defineProps<{
  price: (DisplayPrice & { isRange?: boolean }) | null
}>();
</script>

<template>
  <p
    v-if="price"
    data-testid="product-price"
    :data-amount="price.amount"
    :data-currency="price.currencyCode"
    class="text-sm tabular-nums"
  >
    <span
      v-if="price.isRange"
      class="text-muted"
    >
      od 
    </span>
    {{ price.formatted }}
  </p>
  <p
    v-else
    class="text-xs text-muted"
  >
    Cena niedostępna w tym regionie
  </p>
</template>
