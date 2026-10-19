<script setup lang="ts">
const { state, items, reload } = useWishlist()
useHead({ title: 'Ulubione | Rigby' })
</script>

<template>
  <main>
    <h1>Ulubione produkty</h1>
    <template v-if="!state.customer">
      <p>Zaloguj się, aby zobaczyć zapisane produkty.</p>
      <NuxtLink to="/login">Zaloguj się</NuxtLink>
    </template>
    <template v-else>
      <button type="button" :disabled="state.authPending || !!state.pendingProduct" @click="reload">{{ state.pendingProduct === 'refresh' ? 'Odświeżanie…' : 'Odśwież listę' }}</button>
      <p v-if="!state.loaded">Oczekiwanie na pobranie zapisanych produktów.</p>
      <template v-else-if="items.length === 0">
        <p>Nie masz jeszcze ulubionych produktów.</p>
        <NuxtLink to="/">Przeglądaj produkty</NuxtLink>
      </template>
      <ul v-else class="product-list">
        <li v-for="item in items" :key="item.id" data-testid="wishlist-item" :data-product-id="item.product_id">
          <article>
            <img v-if="item.product?.thumbnail" :src="item.product.thumbnail" :alt="item.product.title" width="120" height="160" loading="lazy">
            <h2>{{ item.product?.title || 'Produkt niedostępny' }}</h2>
            <p v-if="!item.product">Ten produkt nie jest już dostępny w sklepie. Możesz usunąć go z ulubionych.</p>
            <WishlistButton :product-id="item.product_id" :title="item.product?.title || 'Produkt niedostępny'" />
          </article>
        </li>
      </ul>
    </template>
  </main>
</template>
