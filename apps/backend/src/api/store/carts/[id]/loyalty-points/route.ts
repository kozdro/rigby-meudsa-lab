import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { applyLoyaltyOnCartWorkflow, removeLoyaltyFromCartWorkflow } from '../../../../../workflows/loyalty/cart'
import type { ApplyLoyaltyPointsBody } from './validators'

export async function POST(req: AuthenticatedMedusaRequest<ApplyLoyaltyPointsBody>, res: MedusaResponse) {
  const { result: cart } = await applyLoyaltyOnCartWorkflow(req.scope).run({
    input: { cart_id: req.params.id, customer_id: req.auth_context.actor_id, points: req.validatedBody.points },
  })
  res.json({ cart })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result: cart } = await removeLoyaltyFromCartWorkflow(req.scope).run({
    input: { cart_id: req.params.id, customer_id: req.auth_context.actor_id },
  })
  res.json({ cart })
}
