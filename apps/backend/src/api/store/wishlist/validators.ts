import { z } from '@medusajs/framework/zod'

export const AddWishlistItemSchema = z.strictObject({
  product_id: z.string().trim().min(1).max(255),
})

export type AddWishlistItem = z.infer<typeof AddWishlistItemSchema>
