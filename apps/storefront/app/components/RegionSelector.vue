<script setup lang="ts">
const { regions, region, selectRegion } = useStoreRegion();
</script>

<template>
  <div
    v-if="regions?.length"
    class="flex min-w-0 items-center gap-2"
    :data-region-id="region?.id"
  >
    <label
      for="store-region"
      class="eyebrow shrink-0 text-muted"
    >
      Region
    </label
    >
    <select
      id="store-region"
      data-testid="region-selector"
      :value="region?.id"
      class="min-h-11 min-w-0 max-w-52 border-0 bg-transparent py-2 pr-3 pl-1 text-sm"
      @change="selectRegion(($event.target as HTMLSelectElement).value)"
    >
      <option
        v-for="item in regions"
        :key="item.id"
        :value="item.id"
      >
        {{ item.name }} / {{ item.currency_code.toUpperCase() }}
      </option>
    </select>
  </div>
</template>
