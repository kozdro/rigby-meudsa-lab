import { model } from '@medusajs/framework/utils'

export const LoyaltyRedemption = model.define('loyalty_redemption', {
  id: model.id({ prefix: 'lredeem' }).primaryKey(),
  cart_id: model.text().unique(),
  customer_id: model.text(),
  promotion_id: model.text().unique(),
  points: model.number(),
  active: model.boolean().default(true),
})
