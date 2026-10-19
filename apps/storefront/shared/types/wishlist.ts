import type { HttpTypes } from '@medusajs/types'

export type CustomerSummary = Pick<HttpTypes.StoreCustomer, 'id' | 'email' | 'first_name'>

export interface CustomerSession {
  customer: CustomerSummary | null
}

export interface WishlistItem {
  id: string
  product_id: string
  product: Pick<HttpTypes.StoreProduct, 'id' | 'title' | 'handle' | 'thumbnail'> | null
}

export interface WishlistResponse {
  wishlist: { id: string, items: WishlistItem[] } | null
}
