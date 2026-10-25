import { model } from '@medusajs/framework/utils'

export const LoyaltyEntry = model.define('loyalty_entry', {
  id: model.id({ prefix: 'lentry' }).primaryKey(),
  operation_key: model.text().unique(),
  customer_id: model.text(),
  points: model.number(),
  state: model.enum(['applied', 'reversed']).default('applied'),
  attempt_token: model.text().nullable(),
})
