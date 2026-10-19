import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { readWishlist } from '../../../workflows/wishlist/read'

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const result = await readWishlist(req.scope, {
    customer_id: req.auth_context.actor_id,
    sales_channel_ids: req.publishable_key_context?.sales_channel_ids ?? [],
  })
  res.json(result)
}
