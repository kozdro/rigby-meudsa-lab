import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { removeWishlistItemWorkflow } from '../../../../../workflows/remove-wishlist-item'
import { readWishlist } from '../../../../../workflows/wishlist/read'

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const input = {
    customer_id: req.auth_context.actor_id,
    sales_channel_ids: req.publishable_key_context?.sales_channel_ids ?? [],
    product_id: req.params.product_id,
  }
  await removeWishlistItemWorkflow(req.scope).run({ input })
  res.json(await readWishlist(req.scope, input))
}
