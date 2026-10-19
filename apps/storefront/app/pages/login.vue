<script setup lang="ts">
const { state, login } = useWishlist()
const email = ref('')
const password = ref('')

useHead({ title: 'Logowanie | Rigby' })

async function submit() {
  const result = await login(email.value, password.value)
  password.value = ''
  if (result) await navigateTo('/wishlist')
}
</script>

<template>
  <main>
    <h1>Zaloguj się</h1>
    <template v-if="state.customer">
      <p>Jesteś zalogowany jako {{ state.customer.email }}.</p>
      <NuxtLink to="/wishlist">Przejdź do ulubionych</NuxtLink>
    </template>
    <form v-else class="login-form" @submit.prevent="submit">
      <p>Zaloguj się na istniejące konto klienta, aby zapisywać ulubione produkty.</p>
      <label for="email">Adres e-mail</label>
      <input id="email" v-model="email" name="email" type="email" autocomplete="username" maxlength="320" required :disabled="state.authPending">
      <label for="password">Hasło</label>
      <input id="password" v-model="password" name="password" type="password" autocomplete="current-password" maxlength="4096" required :disabled="state.authPending">
      <button type="submit" data-testid="login-submit" :disabled="state.authPending || !!state.pendingProduct">{{ state.authPending ? 'Logowanie…' : 'Zaloguj się' }}</button>
    </form>
  </main>
</template>

<style scoped>
.login-form {
  display: grid;
  gap: 12px;
  max-width: 420px;
}
</style>
