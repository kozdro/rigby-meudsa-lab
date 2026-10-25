import { z } from '@medusajs/framework/zod'

export const ApplyLoyaltyPointsSchema = z.object({
  points: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).multipleOf(100),
})

export type ApplyLoyaltyPointsBody = z.infer<typeof ApplyLoyaltyPointsSchema>
