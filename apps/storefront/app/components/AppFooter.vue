<template>
  <footer class="mt-auto border-t border-line">
    <div class="site-container flex flex-col justify-between gap-7 py-10 md:flex-row md:items-center md:py-12">
      <div>
        <NuxtLink
          to="/"
          aria-label="Rigby — katalog produktów"
          class="inline-flex min-h-11 items-center text-3xl font-semibold tracking-[-.08em]"
        >
          rigby<span class="text-accent">.</span>
        </NuxtLink
        >
        <p class="mt-1 text-xs text-muted">
          Przestrzeń na Twój styl.
        </p>
      </div>
      <nav
        aria-label="Nawigacja w stopce"
        class="flex flex-wrap gap-x-7 gap-y-1"
      >
        <NuxtLink
          to="/"
          class="text-link"
        >
          Kolekcja
        </NuxtLink
        >
        <NuxtLink
          to="/wishlist"
          class="text-link"
        >
          Ulubione
        </NuxtLink
        >
        <NuxtLink
          to="/login"
          class="text-link"
        >
          Twoje konto
        </NuxtLink
        >
      </nav>
      <p class="eyebrow text-muted">
        Rigby / Essentials
      </p>
    </div>
  </footer>
</template>
