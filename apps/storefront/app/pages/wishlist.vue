<script setup lang="ts">
const { state, items, reload } = useWishlist();

useSeoMeta({ title: "Ulubione", description: "Twoja osobista lista ulubionych produktów Rigby." });
</script>

<template>
  <main
    id="main-content"
    class="site-container pb-20 md:pb-28"
  >
    <div class="flex flex-col justify-between gap-6 pt-12 pb-10 md:flex-row md:items-end md:pt-20 md:pb-14">
      <div>
        <p class="eyebrow mb-5 text-accent">Rigby / Twoja selekcja</p>
        <h1 class="page-heading">
          Ulubione<br>produkty
          <span class="text-accent">.</span>
        </h1>
        <p class="mt-6 text-sm leading-7 text-muted">Rzeczy, które chcesz mieć na oku.</p>
      </div>
      <button
        v-if="state.customer"
        type="button"
        class="button-secondary self-start md:self-auto"
        :disabled="state.authPending || !!state.pendingProduct"
        @click="reload"
      >
        {{ state.pendingProduct === "refresh" ? "Odświeżanie…" : "Odśwież listę" }}
      </button>
    </div>
    <div
      v-if="!state.customer"
      class="state-panel"
    >
      <StoreIcon
        name="heart"
        class="mx-auto mb-5 size-8 text-accent"
      />
      <h2>Twoje ulubione, zawsze pod ręką.</h2>
      <p>Zaloguj się, aby zobaczyć zapisane produkty.</p>
      <NuxtLink
        to="/login"
        class="button-primary"
       >
        Zaloguj się
        <StoreIcon name="arrow" />
      </NuxtLink>
    </div>
    <template v-else>
      <div class="mb-7 flex items-center justify-between border-y border-line py-5">
        <h2 class="text-sm">
          Zapisane produkty <span class="ml-2 text-muted">({{ items.length }})</span>
        </h2>
        <NuxtLink
          to="/"
          class="text-sm hover:text-accent"
        >
          Kolekcja <span aria-hidden="true">↗</span>
        </NuxtLink>
      </div>
      <p
        v-if="!state.loaded"
        class="state-panel"
        role="status"
      >
        Oczekiwanie na pobranie zapisanych produktów.
      </p>
      <div
        v-else-if="items.length === 0"
        class="state-panel"
      >
        <StoreIcon
          name="heart"
          class="mx-auto mb-5 size-8 text-accent"
        />
        <h2>Jeszcze nic nie zapisano.</h2>
        <p>Nie masz jeszcze ulubionych produktów.</p>
        <NuxtLink
          to="/"
          class="button-primary"
        >
          Przeglądaj produkty<StoreIcon name="arrow" />
        </NuxtLink>
      </div>
      <ul
        v-else
        class="product-grid"
      >
        <li
          v-for="item in items"
          :key="item.id"
          data-testid="wishlist-item"
          :data-product-id="item.product_id"
          class="min-w-0"
        >
          <article>
            <NuxtLink
              v-if="item.product?.handle"
              :to="`/products/${encodeURIComponent(item.product.handle)}`"
              :aria-label="`Zobacz produkt: ${item.product.title}`"
              class="block"
            >
              <ProductImage
                :src="item.product.thumbnail"
                :alt="item.product.title"
              />
            </NuxtLink>
            <ProductImage
              v-else
              :src="item.product?.thumbnail"
              :alt="item.product?.title || 'Produkt niedostępny'"
            />
            <h2 class="mt-4 mb-3 min-h-11 text-sm leading-snug font-medium md:text-base">
              <NuxtLink
                v-if="item.product?.handle"
                :to="`/products/${encodeURIComponent(item.product.handle)}`"
                class="inline-flex min-h-11 items-center hover:text-accent"
              >
                {{ item.product.title }}
              </NuxtLink>
              <span v-else>{{ item.product?.title || "Produkt niedostępny" }}</span>
            </h2>
            <p
              v-if="!item.product"
              class="mb-4 text-xs leading-6 text-muted"
            >
              Ten produkt nie jest już dostępny w sklepie. Możesz usunąć go z ulubionych.
            </p>
            <WishlistButton
              :product-id="item.product_id"
              :title="item.product?.title || 'Produkt niedostępny'"
            />
          </article>
        </li>
      </ul>
    </template>
  </main>
</template>
