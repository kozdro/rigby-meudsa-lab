<script setup lang="ts">
import type { HttpTypes } from "@medusajs/types";
import type { CartResponse } from "../../shared/types/cart";

const { state: customer } = useWishlist();
const { state, mutate } = useCart();
const requestFetch = useRequestFetch();
const order = ref<HttpTypes.StoreOrder | null>(null);
const blocks = ref(1);
const shippingOption = ref("");
const paymentProvider = ref("");
const address = reactive({ first_name: "", last_name: "", address_1: "", city: "", postal_code: "", country_code: "" });
const addressFields = [
  { key: "first_name", label: "Imię", autocomplete: "given-name", test: "first-name" },
  { key: "last_name", label: "Nazwisko", autocomplete: "family-name", test: "last-name" },
  { key: "address_1", label: "Ulica i numer", autocomplete: "address-line1", test: "address" },
  { key: "city", label: "Miasto", autocomplete: "address-level2", test: "city" },
  { key: "postal_code", label: "Kod pocztowy", autocomplete: "postal-code", test: "postal" },
] as const;

const {
  data: details,
  error: loadError,
  status,
  refresh,
} = await useAsyncData(
  "cart-details",
  async () => {
    if (!customer.value.customer) return null;
    return requestFetch<CartResponse>("/api/cart");
  },
  { watch: [() => customer.value.customer?.id] },
);

watch(
  details,
  (value) => {
    state.value.response = value || null;
    if (value) state.value.uncertain = false;
  },
  { immediate: true },
);

const {
  data: loyalty,
  error: loyaltyError,
  refresh: refreshLoyalty,
} = await useAsyncData(
  "cart-loyalty",
  async () => {
    if (!customer.value.customer) return null;
    return requestFetch<{ points: number }>("/api/customer/loyalty-points");
  },
  { watch: [() => customer.value.customer?.id] },
);

const cart = computed(() => state.value.response?.cart);
const countries = computed(() => cart.value?.region?.countries || []);
const shippingOptions = computed(() => state.value.response?.shipping_options || []);
const paymentProviders = computed(() => state.value.response?.payment_providers || []);
const loyaltyApplied = computed(
  () => !!cart.value?.promotions?.some((promotion) => promotion.id === cart.value?.metadata?.loyalty_promo_id),
);
const addressSaved = computed(() =>
  Object.entries(address).every(
    ([key, value]) => value === cart.value?.shipping_address?.[key as keyof HttpTypes.StoreCartAddress],
  ),
);
const shippingSaved = computed(
  () =>
    !!shippingOption.value &&
    cart.value?.shipping_methods?.some((method) => method.shipping_option_id === shippingOption.value),
);
const money = (amount: number | undefined) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency: "EUR" }).format(amount || 0);

watch(
  () => cart.value?.id,
  () => {
    for (const key of Object.keys(address) as (keyof typeof address)[])
      address[key] = cart.value?.shipping_address?.[key] || "";
    if (!address.country_code) address.country_code = countries.value[0]?.iso_2 || "";
    shippingOption.value = cart.value?.shipping_methods?.[0]?.shipping_option_id || "";
  },
  { immediate: true },
);

watch(
  () => customer.value.customer?.id,
  () => {
    order.value = null;
  },
);

async function saveAddress() {
  if (await mutate("/api/cart/address", "POST", { ...address })) {
    for (const key of Object.keys(address) as (keyof typeof address)[])
      address[key] = cart.value?.shipping_address?.[key] || "";
    shippingOption.value = cart.value?.shipping_methods?.[0]?.shipping_option_id || "";
    state.value.notice = "Zapisano adres dostawy.";
  }
}

async function saveShipping() {
  if (await mutate("/api/cart/shipping", "POST", { option_id: shippingOption.value }))
    state.value.notice = "Zapisano sposób dostawy.";
}

async function changeQuantity(id: string, event: Event) {
  const quantity = Number((event.target as HTMLInputElement).value);
  await mutate(`/api/cart/items/${encodeURIComponent(id)}`, "PATCH", { quantity });
}

async function redeem(remove = false) {
  await mutate(
    "/api/cart/loyalty-points",
    remove ? "DELETE" : "POST",
    remove ? undefined : { points: blocks.value * 100 },
  );
  await refreshLoyalty();
}

async function placeOrder() {
  if (state.value.pending || !customer.value.customer) return;
  const owner = customer.value.customer.id;
  const completedCartId = cart.value?.id;
  state.value.pending = true;
  state.value.error = "";
  state.value.notice = "";
  try {
    const result = await requestFetch<{ order: HttpTypes.StoreOrder }>("/api/cart/complete", {
      method: "POST",
      body: { provider_id: cart.value?.completed_at ? "pp_system_default" : paymentProvider.value },
    });
    if (customer.value.customer?.id !== owner) return;
    order.value = result.order;
    // Keep the cart cookie until the order response has actually been parsed.
    // If this acknowledgment fails, the completed cart remains recoverable.
    try {
      await requestFetch("/api/cart/acknowledge", { method: "POST", body: { cart_id: completedCartId } });
    } catch {
      state.value.notice = "Zamówienie zostało złożone. Potwierdzenie koszyka wymaga ponowienia.";
    }
    state.value.response = null;
    clearNuxtData(["current-cart", "cart-details"]);
    await refreshLoyalty();
    await refreshNuxtData("loyalty-points");
  } catch (error) {
    if (customer.value.customer?.id === owner) {
      const failure = error as { data?: { message?: string } };
      state.value.error =
        failure.data?.message || "Nie udało się złożyć zamówienia. Koszyk został zachowany. Spróbuj ponownie.";
    }
  } finally {
    state.value.pending = false;
  }
}

useSeoMeta({ title: "Koszyk", robots: "noindex, nofollow" });
</script>

<template>
  <main
    id="main-content"
    class="site-container py-14 md:py-20"
  >
    <p class="eyebrow mb-5 text-accent">Rigby / Koszyk</p>
    <h1 class="page-heading">Twoje zakupy.</h1>
    <div
      v-if="!customer.customer"
      class="state-panel mt-10"
    >
      <p>Zaloguj się, aby utworzyć koszyk i korzystać z punktów.</p>
      <NuxtLink
        to="/login"
        class="button-primary"
        >Zaloguj się</NuxtLink
      >
    </div>
    <section
      v-else-if="order"
      class="state-panel mt-10"
      aria-labelledby="order-heading"
    >
      <h2 id="order-heading">Dziękujemy za zamówienie.</h2>
      <p>
        Numer zamówienia: <strong data-testid="order-id">{{ order.id }}</strong>
      </p>
      <p class="mt-3">Płatność oczekuje na potwierdzenie. Punkty za zakupy pojawią się po potwierdzeniu płatności.</p>
      <p class="mt-3">
        Saldo: <strong data-testid="completed-points">{{ loyalty?.points ?? "—" }}</strong> pkt
      </p>
      <p
        v-if="state.notice"
        class="feedback mt-3"
        role="status"
      >
        {{ state.notice }}
      </p>
      <NuxtLink
        to="/account"
        class="button-secondary"
        >Twoje punkty</NuxtLink
      >
      <NuxtLink
        to="/"
        class="button-primary ml-3"
        >Wróć do kolekcji</NuxtLink
      >
    </section>
    <section
      v-else-if="cart?.completed_at"
      class="state-panel mt-10"
      aria-labelledby="recover-heading"
    >
      <h2 id="recover-heading">Zamówienie zostało złożone.</h2>
      <p>Odbierz potwierdzenie zamówienia. Ponowienie tej czynności nie tworzy kolejnego zamówienia.</p>
      <p
        v-if="state.error"
        class="feedback mt-3"
        role="alert"
      >
        {{ state.error }}
      </p>
      <button
        type="button"
        data-testid="recover-order"
        class="button-primary"
        :disabled="state.pending"
        @click="placeOrder"
      >
        {{ state.pending ? "Pobieranie…" : "Pokaż potwierdzenie" }}
      </button>
    </section>
    <p
      v-else-if="status === 'pending'"
      class="mt-10"
      role="status"
    >
      Ładowanie koszyka…
    </p>
    <div
      v-else-if="loadError"
      class="feedback mt-10"
      role="alert"
    >
      <p>Nie udało się pobrać koszyka.</p>
      <button
        type="button"
        class="text-link"
        @click="refresh()"
      >
        Spróbuj ponownie
      </button>
    </div>
    <div
      v-else-if="!cart?.items?.length"
      class="state-panel mt-10"
    >
      <h2>Koszyk jest pusty.</h2>
      <p>Wybierz produkty z kolekcji.</p>
      <NuxtLink
        to="/"
        class="button-primary"
        >Przejdź do kolekcji</NuxtLink
      >
    </div>
    <div
      v-else
      class="mt-10 grid items-start gap-10 lg:grid-cols-[1.5fr_1fr]"
    >
      <div class="min-w-0">
        <div
          v-if="state.response?.details_error"
          class="feedback mb-5"
          role="alert"
        >
          <p>Zmiany koszyka zostały zapisane. Nie udało się odświeżyć dostępnej dostawy lub metod płatności.</p>
          <button
            type="button"
            class="text-link"
            :disabled="state.pending"
            @click="refresh()"
          >
            Odśwież opcje zamówienia
          </button>
        </div>
        <ul class="divide-y divide-line border-y border-line">
          <li
            v-for="item in cart.items"
            :key="item.id"
            class="flex flex-wrap items-center gap-4 py-5"
          >
            <div class="min-w-0 flex-1">
              <NuxtLink
                :to="`/products/${item.product_handle}`"
                class="text-link"
                >{{ item.product_title || item.title }}</NuxtLink
              >
              <p class="text-sm text-muted">{{ item.variant_title }} · {{ money(item.unit_price) }} / szt.</p>
            </div>
            <label class="text-sm"
              >Ilość
              <input
                data-testid="cart-quantity"
                :value="item.quantity"
                :aria-label="`Ilość: ${item.product_title || item.title}`"
                type="number"
                min="1"
                max="100"
                class="form-input mt-1 w-24"
                :disabled="state.pending"
                @change="changeQuantity(item.id, $event)"
              />
            </label>
            <button
              type="button"
              class="text-link"
              :disabled="state.pending"
              @click="mutate(`/api/cart/items/${encodeURIComponent(item.id)}`, 'DELETE')"
            >
              Usuń
            </button>
          </li>
        </ul>
        <section
          class="mt-9"
          aria-labelledby="address-heading"
        >
          <h2
            id="address-heading"
            class="text-2xl tracking-tight"
          >
            1. Adres dostawy
          </h2>
          <p class="mt-3 text-sm text-muted">
            {{ customer.customer.email }} · Adres rozliczeniowy taki sam jak adres dostawy.
          </p>
          <form
            class="mt-5 grid gap-4 sm:grid-cols-2"
            @submit.prevent="saveAddress"
          >
            <label
              v-for="field in addressFields"
              :key="field.key"
              class="text-sm"
              >{{ field.label }}
              <input
                v-model="address[field.key]"
                :data-testid="`checkout-${field.test}`"
                :name="field.key"
                :autocomplete="field.autocomplete"
                required
                maxlength="200"
                class="form-input mt-2"
                :disabled="state.pending"
              />
            </label>
            <label class="text-sm"
              >Kraj
              <select
                v-model="address.country_code"
                data-testid="checkout-country"
                name="country_code"
                autocomplete="country"
                required
                class="form-input mt-2"
                :disabled="state.pending"
              >
                <option
                  disabled
                  value=""
                >
                  Wybierz kraj
                </option>
                <option
                  v-for="country in countries"
                  :key="country.iso_2"
                  :value="country.iso_2"
                >
                  {{ country.display_name || country.name }}
                </option>
              </select>
            </label>
            <button
              type="submit"
              data-testid="save-address"
              class="button-secondary sm:col-span-2"
              :disabled="state.pending"
            >
              Zapisz adres i sprawdź dostawę
            </button>
          </form>
        </section>
        <section
          v-if="cart.shipping_address?.country_code"
          class="mt-9"
          aria-labelledby="shipping-heading"
        >
          <h2
            id="shipping-heading"
            class="text-2xl tracking-tight"
          >
            2. Dostawa
          </h2>
          <form
            v-if="shippingOptions.length"
            class="mt-5 grid gap-3"
            @submit.prevent="saveShipping"
          >
            <label
              for="shipping-option"
              class="text-sm"
              >Sposób dostawy</label
            >
            <select
              id="shipping-option"
              v-model="shippingOption"
              data-testid="shipping-option"
              required
              class="form-input"
              :disabled="state.pending || !addressSaved"
            >
              <option
                disabled
                value=""
              >
                Wybierz dostawę
              </option>
              <option
                v-for="option in shippingOptions"
                :key="option.id"
                :value="option.id"
              >
                {{ option.name }}{{ typeof option.amount === "number" ? ` — ${money(option.amount)}` : "" }}
              </option>
            </select>
            <button
              type="submit"
              data-testid="save-shipping"
              class="button-secondary"
              :disabled="state.pending || !addressSaved || !shippingOption"
            >
              Zapisz sposób dostawy
            </button>
          </form>
          <p
            v-else
            class="feedback mt-5"
          >
            Brak dostępnej dostawy dla tego adresu i koszyka.
          </p>
        </section>
        <section
          class="mt-9"
          aria-labelledby="payment-heading"
        >
          <h2
            id="payment-heading"
            class="text-2xl tracking-tight"
          >
            3. Płatność
          </h2>
          <label
            v-if="paymentProviders.length"
            class="mt-5 block text-sm"
            >Metoda płatności
            <select
              v-model="paymentProvider"
              data-testid="payment-provider"
              class="form-input mt-2"
              :disabled="state.pending"
            >
              <option
                disabled
                value=""
              >
                Wybierz płatność
              </option>
              <option
                v-for="provider in paymentProviders"
                :key="provider.id"
                :value="provider.id"
              >
                Płatność ręczna — potwierdzenie po zamówieniu
              </option>
            </select>
          </label>
          <p
            v-else
            class="feedback mt-5"
          >
            Płatność ręczna jest chwilowo niedostępna.
          </p>
        </section>
      </div>
      <aside
        class="border border-line p-6 lg:sticky lg:top-28"
        aria-labelledby="summary-heading"
      >
        <h2
          id="summary-heading"
          class="text-2xl tracking-tight"
        >
          Podsumowanie
        </h2>
        <dl
          class="mt-6 space-y-4 text-sm"
          aria-live="polite"
        >
          <div class="flex justify-between gap-3">
            <dt>Produkty po rabatach (z VAT)</dt>
            <dd data-testid="cart-product-total">{{ money(cart.item_total) }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt>Dostawa</dt>
            <dd data-testid="cart-shipping-total">{{ money(cart.shipping_total) }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt>Rabaty</dt>
            <dd data-testid="cart-discount-total">−{{ money(cart.discount_total) }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt>W tym VAT</dt>
            <dd>{{ money(cart.tax_total) }}</dd>
          </div>
          <div class="flex justify-between gap-3 border-t border-line pt-4 text-lg">
            <dt>Razem</dt>
            <dd data-testid="cart-total">{{ money(cart.total) }}</dd>
          </div>
        </dl>
        <section
          class="mt-7 border-t border-line pt-6"
          aria-labelledby="loyalty-heading"
        >
          <h3
            id="loyalty-heading"
            class="text-lg"
          >
            Punkty lojalnościowe
          </h3>
          <p
            v-if="loyalty"
            class="mt-3 text-sm"
          >
            Saldo: <strong data-testid="cart-points">{{ loyalty.points }}</strong> pkt
          </p>
          <p
            v-if="loyaltyError"
            class="mt-3 text-sm"
            role="alert"
          >
            Nie udało się pobrać salda.
            <button
              type="button"
              class="text-link"
              @click="refreshLoyalty()"
            >
              Spróbuj ponownie
            </button>
          </p>
          <p class="mt-3 text-sm leading-6 text-muted">
            100 pkt = 10 € rabatu na produkty. Punkty zostaną wykorzystane po złożeniu zamówienia.
          </p>
          <button
            v-if="loyaltyApplied"
            type="button"
            data-testid="remove-loyalty"
            class="button-secondary mt-4 w-full"
            :disabled="state.pending"
            @click="redeem(true)"
          >
            Usuń rabat punktowy
          </button>
          <form
            v-else
            class="mt-4"
            @submit.prevent="redeem()"
          >
            <label
              for="loyalty-blocks"
              class="text-sm"
              >Liczba bloków po 100 pkt</label
            >
            <input
              id="loyalty-blocks"
              v-model.number="blocks"
              data-testid="loyalty-blocks"
              type="number"
              min="1"
              :max="Math.max(1, Math.floor((loyalty?.points || 0) / 100))"
              required
              class="form-input mt-2"
              :disabled="state.pending"
            />
            <button
              type="submit"
              data-testid="apply-loyalty"
              class="button-secondary mt-3 w-full"
              :disabled="state.pending || !loyalty || loyalty.points < 100"
            >
              Wykorzystaj punkty
            </button>
          </form>
        </section>
        <p
          v-if="state.error"
          role="alert"
          class="feedback mt-5"
        >
          {{ state.error }}
        </p>
        <p
          v-if="state.notice"
          role="status"
          class="feedback mt-5"
        >
          {{ state.notice }}
        </p>
        <button
          type="button"
          data-testid="place-order"
          class="button-primary mt-7 w-full"
          :disabled="state.pending || customer.authPending || !addressSaved || !shippingSaved || !paymentProvider"
          @click="placeOrder"
        >
          {{ state.pending ? "Przetwarzanie…" : `Złóż zamówienie — ${money(cart.total)}` }}
        </button>
        <p class="mt-3 text-xs leading-6 text-muted">
          Płatność zostanie autoryzowana przy zamówieniu i potwierdzona osobno.
        </p>
      </aside>
    </div>
  </main>
</template>
