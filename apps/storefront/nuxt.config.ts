import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: {
    enabled: true,
  },
  css: ["~/assets/css/main.css"],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ["@medusajs/medusa-js"],
    },
  },
  runtimeConfig: {
    public: {
      medusaBackendUrl: "http://localhost:9000",
      medusaPublishableKey: "",
    },
  },
});
