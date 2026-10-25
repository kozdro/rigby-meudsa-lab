import { model } from '@medusajs/framework/utils'

export const LoyaltyPoint = model.define('loyalty_point', {
  id: model.id({ prefix: 'lpoint' }).primaryKey(),
  customer_id: model.text().unique(),
  points: model.number().default(0),
})
