import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { addWishlistItemWorkflow } from '../../../../workflows/add-wishlist-item'
import { readWishlist } from '../../../../workflows/wishlist/read'
import type { AddWishlistItem } from '../validators'

export async function POST(req: AuthenticatedMedusaRequest<AddWishlistItem>, res: MedusaResponse) {
  const input = {
    customer_id: req.auth_context.actor_id,
    sales_channel_ids: req.publishable_key_context?.sales_channel_ids ?? [],
    product_id: req.validatedBody.product_id,
  }
  await addWishlistItemWorkflow(req.scope).run({ input })
  res.json(await readWishlist(req.scope, input))
}
