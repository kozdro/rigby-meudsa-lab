import type { MedusaContainer } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, ProductStatus } from '@medusajs/framework/utils'
import { WISHLIST_MODULE } from '../../modules/wishlist'
import type WishlistModuleService from '../../modules/wishlist/service'

export type WishlistContext = { customer_id: string, sales_channel_ids: string[] }
export type WishlistProduct = {
  id: string
  title: string
  handle: string | null
  thumbnail: string | null
}

export async function visibleProducts(
  container: MedusaContainer,
  productIds: string[],
  salesChannelIds: string[]
): Promise<WishlistProduct[]> {
  if (!productIds.length || !salesChannelIds.length) return []

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  // Query the link's own columns, then constrain the product query by those IDs.
  // This avoids unsupported cross-module graph filters and stale search indexes.
  const { data: links } = await query.graph({
    entity: 'product_sales_channel',
    fields: ['product_id'],
    filters: { product_id: productIds, sales_channel_id: salesChannelIds },
  })
  const ids = [...new Set(links.map((link) => link.product_id))]
  if (!ids.length) return []

  const { data } = await query.graph({
    entity: 'product',
    fields: ['id', 'title', 'handle', 'thumbnail'],
    filters: { id: ids, status: ProductStatus.PUBLISHED },
  })
  return data as WishlistProduct[]
}

export async function readWishlist(container: MedusaContainer, input: WishlistContext) {
  const service = container.resolve<WishlistModuleService>(WISHLIST_MODULE)
  const [wishlist] = await service.listWishlists(
    { customer_id: input.customer_id },
    { relations: ['items'], take: 1 }
  )
  if (!wishlist) return { wishlist: null }

  const products = await visibleProducts(
    container, wishlist.items.map((item) => item.product_id), input.sales_channel_ids
  )
  const byId = new Map(products.map((product) => [product.id, product]))
  // Keep saved identities removable if a product is withdrawn. Never return its
  // title/handle/image until it is published in this key's sales channel again.
  return {
    wishlist: {
      id: wishlist.id,
      items: wishlist.items.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product: byId.get(item.product_id) ?? null,
      })),
    },
  }
}
