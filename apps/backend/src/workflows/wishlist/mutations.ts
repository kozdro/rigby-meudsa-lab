import type { MedusaContainer } from '@medusajs/framework/types'
import { MedusaError } from '@medusajs/framework/utils'
import { WISHLIST_MODULE } from '../../modules/wishlist'
import type WishlistModuleService from '../../modules/wishlist/service'
import { visibleProducts, type WishlistContext } from './read'

export type WishlistMutation = WishlistContext & { product_id: string }

export async function validateWishlistProduct(container: MedusaContainer, input: WishlistMutation) {
  const [product] = await visibleProducts(container, [input.product_id], input.sales_channel_ids)
  if (!product) throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Product not found')
}

function isUniqueConflict(error: unknown) {
  return error instanceof MedusaError &&
    error.type === MedusaError.Types.INVALID_DATA && /already exists/.test(error.message)
}

export async function addWishlistItem(container: MedusaContainer, input: WishlistMutation) {
  const service = container.resolve<WishlistModuleService>(WISHLIST_MODULE)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await service.insertItem(input.customer_id, input.product_id)
      return
    } catch (error) {
      if (!isUniqueConflict(error)) throw error
      // insertItem's transaction has rolled back. A competing first add may
      // have created just the wishlist or both rows; retry under a fresh txn.
      const [wishlist] = await service.listWishlists({ customer_id: input.customer_id })
      if (!wishlist || attempt === 2) throw error
      const [item] = await service.listWishlistItems({
        wishlist_id: wishlist.id, product_id: input.product_id,
      })
      if (item) return
    }
  }
}

export async function removeWishlistItem(container: MedusaContainer, input: WishlistMutation) {
  const service = container.resolve<WishlistModuleService>(WISHLIST_MODULE)
  const [wishlist] = await service.listWishlists({ customer_id: input.customer_id })
  if (!wishlist) return
  // Hard delete permits add/remove/add. The selector always includes the
  // authenticated customer's wishlist, never a client-provided resource ID.
  await service.deleteWishlistItems({ wishlist_id: wishlist.id, product_id: input.product_id })
}
