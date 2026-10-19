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
    <h1>Produkty</h1>
    <p>Zapisz produkty, do których chcesz wrócić.</p>

    <p v-if="status === 'pending'">
      Ładowanie produktów...
    </p>

    <p v-else-if="error">
      Błąd: {{ error.message }}
    </p>

    <p v-else-if="status === 'success' && products?.length === 0">
      Brak dostępnych produktów.
    </p>

    <ul v-else class="product-list">
      <li
        v-for="product in products"
        :key="product.id"
      >
        <article>
          <img
            v-if="product.thumbnail"
            :src="product.thumbnail"
            :alt="product.title"
            width="120"
            height="160"
            loading="lazy"
          >

          <h2>{{ product.title }}</h2>
          <p>{{ product.description }}</p>
          <WishlistButton :product-id="product.id" :title="product.title" />
        </article>
      </li>
    </ul>
  </main>
</template>
