<script setup lang="ts">
const { state, login } = useWishlist();

const email = ref("");
const password = ref("");

async function submit() {
  const result = await login(email.value, password.value);
  password.value = "";
  if (result) await navigateTo("/wishlist");
}

useSeoMeta({
  title: "Logowanie",
  description: "Zaloguj się do Rigby, aby wrócić do swojej listy ulubionych produktów.",
});
</script>

<template>
  <main
    id="main-content"
    class="site-container grid gap-12 py-14 md:grid-cols-2 md:gap-20 md:py-24"
  >
    <section class="border-line md:border-r md:pr-16">
      <p class="eyebrow mb-5 text-accent">Rigby / Twoje konto</p>
      <h1 class="page-heading">Dobrze<br>Cię widzieć.</h1>
      <p class="mt-7 max-w-80 text-sm leading-7 text-muted">
        Twoje ulubione w jednym miejscu.<br>Wróć do produktów, które przyciągnęły Twoją uwagę.
      </p>
      <NuxtLink
        to="/"
        class="text-link mt-7"
       >
        <StoreIcon
          name="arrow"
          class="rotate-180"
        />
        Wróć do kolekcji
      </NuxtLink>
    </section>
    <section
      class="w-full max-w-md self-center"
      aria-labelledby="login-heading"
    >
      <h2
        id="login-heading"
        class="text-2xl tracking-tight"
      >
        Zaloguj się
      </h2>
      <template v-if="state.customer"
        ><p class="mt-5 text-sm leading-7 text-muted wrap-break-word">Jesteś zalogowany jako {{ state.customer.email }}.</p>
        <NuxtLink
          to="/wishlist"
          class="button-primary mt-6"
        >
          Przejdź do ulubionych<StoreIcon name="arrow" />
        </NuxtLink>
      </template>
      <form
        v-else
        class="mt-5"
        @submit.prevent="submit"
      >
        <p class="mb-8 text-sm leading-7 text-muted">
          Zaloguj się na istniejące konto klienta, aby zapisywać ulubione produkty.
        </p>
        <label
          for="email"
          class="mb-2 block text-sm font-medium"
        >
          Adres e-mail
        </label>
        <input
          id="email"
          v-model="email"
          name="email"
          type="email"
          inputmode="email"
          autocomplete="username"
          maxlength="320"
          required
          class="form-input"
          :disabled="state.authPending"
        >
        <label
          for="password"
          class="mt-6 mb-2 block text-sm font-medium"
        >
          Hasło
        </label>
        <input
          id="password"
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          maxlength="4096"
          required
          class="form-input"
          :disabled="state.authPending"
        >
        <button
          type="submit"
          data-testid="login-submit"
          class="button-primary mt-8 w-full"
          :disabled="state.authPending || !!state.pendingProduct"
        >
          {{ state.authPending ? "Logowanie…" : "Zaloguj się" }}
          <StoreIcon name="arrow" />
        </button>
      </form>
    </section>
  </main>
</template>
