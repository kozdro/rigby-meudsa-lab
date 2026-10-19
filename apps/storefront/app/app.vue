<script setup lang="ts">
import type { CustomerSession, WishlistResponse } from '../shared/types/wishlist'

const { state, items, logout, reload } = useWishlist()
const requestFetch = useRequestFetch()
const { data: bootstrap, error: sessionError } = await useAsyncData('wishlist-bootstrap', async () => {
  const session = await requestFetch<CustomerSession>('/api/customer/session')
  if (!session.customer) return { customer: null, wishlist: null, loaded: false, error: '' }
  try {
    const response = await requestFetch<WishlistResponse>('/api/wishlist')
    return { customer: session.customer, wishlist: response.wishlist, loaded: true, error: '' }
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    return {
      customer: status === 401 ? null : session.customer,
      wishlist: null,
      loaded: false,
      error: status === 401 ? 'Sesja wygasła. Zaloguj się ponownie.' : 'Nie udało się pobrać ulubionych. Spróbuj ponownie.',
    }
  }
})
if (bootstrap.value) Object.assign(state.value, bootstrap.value)
if (sessionError.value) state.value.error = 'Nie udało się sprawdzić sesji. Spróbuj odświeżyć stronę.'

useHead({ htmlAttrs: { lang: 'pl' } })
</script>

<template>
  <div class="store">
    <header>
      <NuxtLink to="/" class="brand">Rigby Medusa Store</NuxtLink>
      <nav aria-label="Nawigacja główna">
        <NuxtLink to="/">Produkty</NuxtLink>
        <NuxtLink to="/wishlist">Ulubione <span aria-live="polite">({{ items.length }})</span></NuxtLink>
        <template v-if="state.customer">
          <span>{{ state.customer.email }}</span>
          <button type="button" data-testid="logout" :disabled="state.authPending || !!state.pendingProduct" @click="logout">Wyloguj się</button>
        </template>
        <NuxtLink v-else to="/login">Zaloguj się</NuxtLink>
      </nav>
    </header>

    <div v-if="state.error" class="feedback" role="alert">
      <p>{{ state.error }}</p>
      <button v-if="state.customer" type="button" :disabled="state.authPending || !!state.pendingProduct" @click="reload">Spróbuj ponownie</button>
    </div>
    <p v-if="state.notice" role="status">{{ state.notice }}</p>
    <NuxtPage />
  </div>
</template>

<style>
.store {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}
header, nav {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}
header {
  justify-content: space-between;
  margin-bottom: 32px;
}
.brand {
  font-weight: bold;
  font-size: 1.25rem;
}
nav a, button, input {
  box-sizing: border-box;
  min-height: 44px;
}
nav a {
  display: inline-flex;
  align-items: center;
}
button, input {
  font: inherit;
  padding: 8px 12px;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: wait;
}
.product-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: 24px;
  list-style: none;
  padding: 0;
}
.product-list article {
  padding: 16px 0;
}
.product-list img {
  max-width: 100%;
  height: 160px;
  object-fit: contain;
}
.feedback {
  border: 1px solid currentColor;
  padding: 12px;
  margin: 16px 0;
}
</style>
