<script setup lang="ts">
const { state, items, logout } = useWishlist();
const route = useRoute();

const menuOpen = ref(false);
const menuToggle = ref<HTMLButtonElement | null>(null);

function closeMenu(restoreFocus = false) {
  menuOpen.value = false;

  if (restoreFocus) menuToggle.value?.focus();
}

watch(
  () => route.fullPath,
  () => closeMenu(),
);
</script>

<template>
  <header
    class="sticky top-0 z-40 border-b border-line bg-canvas"
    @keydown.esc="closeMenu(true)"
  >
    <div class="site-container flex h-20 items-center justify-between gap-4 md:h-24">
      <NuxtLink
        to="/"
        aria-label="Rigby — katalog produktów"
        class="inline-flex min-h-11 items-center text-[2rem] leading-none font-semibold tracking-[-.08em] md:text-4xl"
        >rigby<span class="text-accent">.</span></NuxtLink
      >
      <nav
        aria-label="Nawigacja główna"
        class="hidden items-center gap-9 text-sm md:flex"
      >
        <NuxtLink
          to="/"
          class="text-link"
          :class="{ 'text-accent': route.path === '/' }"
          :aria-current="route.path === '/' ? 'page' : undefined"
          >Kolekcja</NuxtLink
        >
        <NuxtLink
          to="/wishlist"
          class="text-link"
          :class="{ 'text-accent': route.path === '/wishlist' }"
          :aria-current="route.path === '/wishlist' ? 'page' : undefined"
          >Twoje ulubione</NuxtLink
        >
      </nav>
      <div class="flex items-center gap-1 md:gap-5">
        <NuxtLink
          to="/wishlist"
          :aria-label="`Ulubione produkty: ${items.length}`"
          class="flex min-h-11 min-w-11 items-center justify-center gap-2 hover:text-accent"
        >
          <StoreIcon name="heart" />
          <span
            data-testid="wishlist-count"
            aria-live="polite"
            aria-atomic="true"
            class="text-xs tabular-nums"
            >{{ items.length }}</span
          >
        </NuxtLink>
        <button
          v-if="state.customer"
          type="button"
          data-testid="logout"
          class="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 text-sm hover:text-accent"
          :disabled="state.authPending || !!state.pendingProduct"
          @click="logout"
        >
          <StoreIcon name="user" /><span class="sr-only md:not-sr-only">{{
            state.authPending ? "Wylogowywanie…" : "Wyloguj się"
          }}</span>
        </button>
        <NuxtLink
          v-else
          to="/login"
          class="flex min-h-11 min-w-11 items-center justify-center gap-2 text-sm hover:text-accent"
          aria-label="Zaloguj się"
          ><StoreIcon name="user" /><span class="hidden lg:inline">Zaloguj się</span></NuxtLink
        >
        <button
          ref="menuToggle"
          type="button"
          data-testid="mobile-menu-toggle"
          class="flex min-h-11 min-w-11 items-center justify-center md:hidden"
          :aria-expanded="menuOpen"
          aria-controls="mobile-navigation"
          :aria-label="menuOpen ? 'Zamknij menu' : 'Otwórz menu'"
          @click="menuOpen = !menuOpen"
        >
          <StoreIcon :name="menuOpen ? 'close' : 'menu'" />
        </button>
      </div>
    </div>
    <nav
      v-if="menuOpen"
      id="mobile-navigation"
      aria-label="Nawigacja mobilna"
      class="border-t border-line px-5 pb-6 md:hidden"
    >
      <NuxtLink
        to="/"
        class="flex min-h-14 items-center justify-between border-b border-line text-sm"
        :aria-current="route.path === '/' ? 'page' : undefined"
        >Kolekcja<StoreIcon name="arrow"
      /></NuxtLink>
      <NuxtLink
        to="/wishlist"
        class="flex min-h-14 items-center justify-between border-b border-line text-sm"
        :aria-current="route.path === '/wishlist' ? 'page' : undefined"
        >Twoje ulubione<StoreIcon name="heart"
      /></NuxtLink>
      <div
        v-if="state.customer"
        class="pt-4"
      >
        <p class="truncate text-xs text-muted">{{ state.customer.email }}</p>
      </div>
      <NuxtLink
        v-else
        to="/login"
        class="text-link mt-2"
        >Zaloguj się<StoreIcon name="user"
      /></NuxtLink>
    </nav>
  </header>
</template>
