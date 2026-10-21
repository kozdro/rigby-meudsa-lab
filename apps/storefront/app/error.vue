<script setup lang="ts">
import type { NuxtError } from "#app";

defineProps<{
  error: NuxtError;
}>();

useHead({
  htmlAttrs: { lang: "pl" },
  title: "Nie znaleziono strony | Rigby",
});
</script>

<template>
  <div class="flex min-h-screen flex-col bg-canvas">
    <header class="border-b border-line">
      <div class="site-container flex h-20 items-center">
        <a
          href="/"
          aria-label="Rigby — katalog produktów"
          class="text-3xl font-semibold tracking-[-.08em]"
        >
          rigby<span class="text-accent">.</span>
        </a>
      </div>
    </header>
    <main
      id="main-content"
      class="site-container flex-1 py-20 md:py-32"
    >
      <p class="eyebrow mb-6 text-accent">Rigby / {{ error.status }}</p>
      <h1 class="page-heading max-w-3xl">
        {{ error.status === 404 ? "Tego produktu tutaj nie ma." : "Coś poszło nie tak." }}
      </h1>
      <p class="mt-7 max-w-md text-sm leading-7 text-muted">
        {{
          error.status === 404
            ? "Produkt lub strona są niedostępne. Wróć do kolekcji i odkryj pozostałe produkty."
            : "Nie udało się wyświetlić strony. Spróbuj ponownie za chwilę."
        }}
      </p>
      <button
        type="button"
        class="button-primary mt-8"
        @click="clearError({ redirect: '/' })"
      >
        Wróć do kolekcji<StoreIcon name="arrow" />
      </button>
    </main>
    <AppFooter />
  </div>
</template>
