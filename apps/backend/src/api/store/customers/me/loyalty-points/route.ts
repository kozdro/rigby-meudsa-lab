import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import LoyaltyModuleService from '../../../../../modules/loyalty/service'
import { LOYALTY_MODULE } from '../../../../../modules/loyalty'

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const loyalty: LoyaltyModuleService = req.scope.resolve(LOYALTY_MODULE)
  res.setHeader('Cache-Control', 'private, no-store')
  res.json({ points: await loyalty.getPoints(req.auth_context.actor_id) })
}
