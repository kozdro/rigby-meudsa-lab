import type { WishlistResponse } from '../../../../shared/types/wishlist'
import { assertSameOrigin, customerSdk, customerError } from '../../../utils/customer'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const productId = getRouterParam(event, 'product_id')
  if (!productId || productId.length > 255) {
    throw createError({ statusCode: 400, message: 'Podaj identyfikator produktu.' })
  }
  try {
    const sdk = await customerSdk(event)
    return await sdk.client.fetch<WishlistResponse>(`/store/wishlist/items/${encodeURIComponent(productId)}`, { method: 'DELETE' })
  } catch (error) {
    return customerError(event, error)
  }
})
