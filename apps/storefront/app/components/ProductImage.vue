<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    src?: string | null;
    alt: string;
    eager?: boolean;
  }>(),
  { src: null, eager: false },
);

const failed = ref(false);

watch(
  () => props.src,
  () => {
    failed.value = false;
  },
);
</script>

<template>
  <div class="flex aspect-3/4 w-full items-center justify-center overflow-hidden bg-surface">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="alt"
      width="600"
      height="800"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager ? 'high' : 'auto'"
      class="h-full w-full object-contain mix-blend-multiply"
      @error="failed = true"
    />
    <span
      v-else
      class="px-3 text-center text-xs text-muted"
    >
      Zdjęcie niedostępne
    </span>
  </div>
</template>
