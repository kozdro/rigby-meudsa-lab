import type { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { awardCapturedOrderPointsWorkflow } from '../workflows/loyalty/award-points'

export default async function loyaltyPaymentCaptured({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  await awardCapturedOrderPointsWorkflow(container).run({ input: { payment_id: data.id } })
}

export const config: SubscriberConfig = {
  event: 'payment.captured',
}
