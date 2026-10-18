import Medusa from '@medusajs/js-sdk'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  const medusa = new Medusa({
    baseUrl: config.public.medusaBackendUrl,
    publishableKey: config.public.medusaPublishableKey,
  })

  return {
    provide: {
      medusa,
    },
  }
})