<script setup lang="ts">
const { $medusa } = useNuxtApp()

const {
  data: products,
  status,
  error,
} = await useAsyncData('products', async () => {
  const response = await $medusa.store.product.list({
    limit: 20,
  })

  return response.products
})
</script>

<template>
  <main>
    <h1>Rigby Medusa Store</h1>

    <p v-if="status === 'pending'">
      Ładowanie produktów...
    </p>

    <p v-else-if="error">
      Błąd: {{ error.message }}
    </p>

    <ul v-else>
      <li
        v-for="product in products"
        :key="product.id"
      >
        <img
          v-if="product.thumbnail"
          :src="product.thumbnail"
          :alt="product.title"
          width="120"
        />

        <h2>{{ product.title }}</h2>
        <p>{{ product.description }}</p>
      </li>
    </ul>
  </main>
</template>