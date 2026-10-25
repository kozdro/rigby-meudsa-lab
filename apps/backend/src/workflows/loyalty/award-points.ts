import { createStep, createWorkflow, StepResponse, WorkflowResponse } from '@medusajs/framework/workflows-sdk'
import type { RemoteQueryFunction } from '@medusajs/framework/types'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import LoyaltyModuleService from '../../modules/loyalty/service'
import { LOYALTY_MODULE } from '../../modules/loyalty'

export const awardCapturedOrderPointsStep = createStep(
  'award-captured-order-points',
  async ({ payment_id }: { payment_id: string }, { container }) => {
    const query = container.resolve<RemoteQueryFunction>(ContainerRegistrationKeys.QUERY)
    const { data: payments } = await query.graph({
      entity: 'payment',
      fields: ['id', 'captured_at', 'payment_collection_id'],
      filters: { id: payment_id },
    })
    const payment = payments[0]
    if (!payment?.captured_at) return new StepResponse(null)
    const { data: links } = await query.graph({
      entity: 'order_payment_collection',
      fields: ['order.id'],
      filters: { payment_collection_id: payment.payment_collection_id },
    })
    const orderId = links[0]?.order?.id
    if (!orderId) return new StepResponse(null)
    const { data: orders } = await query.graph({
      entity: 'order',
      fields: ['id', 'status', 'currency_code', 'customer_id', 'item_total', 'payment_collections.status'],
      filters: { id: orderId },
    })
    const order = orders[0]
    if (!order?.customer_id || order.currency_code !== 'eur' || order.status === 'canceled' ||
      !order.payment_collections?.every(collection => collection?.status === 'completed')) {
      return new StepResponse(null)
    }
    // item_total is the discounted product total, including product VAT, with no shipping.
    const points = Math.floor(Number(order.item_total))
    if (points <= 0) return new StepResponse(null)
    const loyalty: LoyaltyModuleService = container.resolve(LOYALTY_MODULE)
    const receipt = await loyalty.changePoints({
      customer_id: order.customer_id,
      operation_key: `earn:${order.id}`,
      points,
    })
    return new StepResponse(receipt)
  }
)

export const awardCapturedOrderPointsWorkflow = createWorkflow(
  'award-captured-order-points',
  function (input: { payment_id: string }) {
    const result = awardCapturedOrderPointsStep(input)
    return new WorkflowResponse(result)
  }
)
