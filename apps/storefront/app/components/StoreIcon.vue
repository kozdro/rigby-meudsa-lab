<script setup lang="ts">
defineProps<{
  name: "heart" | "user" | "arrow" | "menu" | "close" | "chevron" | "check" | "bag";
}>();
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="size-5 shrink-0"
  >
    <path
      v-if="name === 'bag'"
      d="M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2"
    />
    <path
      v-else-if="name === 'heart'"
      d="M20.4 4.6a5.5 5.5 0 0 0-7.8 0L12 5.2l-.6-.6a5.5 5.5 0 0 0-7.8 7.8L12 21l8.4-8.6a5.5 5.5 0 0 0 0-7.8Z"
    />
    <template v-else-if="name === 'user'">
      <circle
        cx="12"
        cy="8"
        r="3.5"
      />
      <path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2" />
    </template>
    <path
      v-else-if="name === 'arrow'"
      d="M4 12h16m-6-6 6 6-6 6"
    />
    <path
      v-else-if="name === 'menu'"
      d="M4 7h16M4 12h16M4 17h16"
    />
    <path
      v-else-if="name === 'close'"
      d="m6 6 12 12M6 18 18 6"
    />
    <path
      v-else-if="name === 'chevron'"
      d="m8 4 8 8-8 8"
    />
    <path
      v-else-if="name === 'check'"
      d="m5 12 4 4L19 6"
    />
  </svg>
</template>
