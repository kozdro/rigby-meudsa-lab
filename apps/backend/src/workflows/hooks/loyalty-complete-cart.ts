import { randomUUID } from 'node:crypto'
import type { CartDTO, PromotionDTO, RemoteQueryFunction } from '@medusajs/framework/types'
import { completeCartWorkflow } from '@medusajs/medusa/core-flows'
import { ContainerRegistrationKeys, MedusaError } from '@medusajs/framework/utils'
import { StepResponse } from '@medusajs/framework/workflows-sdk'
import LoyaltyModuleService, { ChangeReceipt } from '../../modules/loyalty/service'
import { LOYALTY_MODULE } from '../../modules/loyalty'

completeCartWorkflow.hooks.validate(
  async ({ cart }, { container }) => {
    const query = container.resolve<RemoteQueryFunction>(ContainerRegistrationKeys.QUERY)
    const { data: linked } = await query.graph({
      entity: 'order_cart', fields: ['order_id'], filters: { cart_id: cart.id },
    })
    // Core completion invokes validate even when returning an already placed order.
    // Never debit or compensate its already committed settlement on that retry.
    if (linked.length) return new StepResponse(undefined, null)
    // CompleteCart builds the order from this original snapshot. Never settle
    // using a fresh cart read that could describe different product adjustments.
    const snapshot = cart as CartDTO & { promotions?: Pick<PromotionDTO, 'id'>[]; customer?: { id: string } }
    const customerId = snapshot.customer?.id ?? snapshot.customer_id
    const promotionIds = snapshot.promotions?.map(promo => promo.id) ?? []
    const { data: promotions } = promotionIds.length
      ? await query.graph({
        entity: 'promotion',
        fields: ['id', 'code', 'is_tax_inclusive', 'application_method.*', 'rules.*', 'rules.values.*'],
        filters: { id: promotionIds },
      })
      : { data: [] }
    const loyaltyPromos = promotions.filter(promo => promo.code?.startsWith('LOYALTY-'))
    const snapshotAdjustments = (snapshot.items ?? []).flatMap(item => item.adjustments ?? [])
    const loyaltyAdjustments = snapshotAdjustments.filter(adjustment => adjustment.code?.startsWith('LOYALTY-'))
    if (!loyaltyPromos.length && !loyaltyAdjustments.length) return new StepResponse(undefined, null)
    if (loyaltyPromos.length !== 1) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Loyalty product adjustments must match one promotion')
    }
    const loyalty: LoyaltyModuleService = container.resolve(LOYALTY_MODULE)
    const [intent] = await loyalty.listLoyaltyRedemptions({ cart_id: cart.id })
    const promo = loyaltyPromos[0]
    const customerRule = promo.rules?.some(rule => rule?.attribute === 'customer_id' && rule.operator === 'eq' &&
      rule.values?.length === 1 && rule.values[0]?.value === customerId)
    if (!intent?.active || intent.customer_id !== customerId ||
      intent.promotion_id !== promo.id || snapshot.currency_code !== 'eur' || !customerRule ||
      promo.application_method?.currency_code !== 'eur' || promo.application_method.type !== 'fixed' ||
      promo.application_method.target_type !== 'order' || !promo.is_tax_inclusive ||
      !Number.isSafeInteger(intent.points) || intent.points < 100 || intent.points % 100 !== 0 ||
      Number(promo.application_method.value) !== intent.points / 10) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Invalid loyalty promotion for this cart')
    }
    const discounted = snapshotAdjustments.filter(adjustment => adjustment.promotion_id === promo.id)
      .reduce((amount, adjustment) => amount + Number(adjustment.amount), 0)
    if (loyaltyAdjustments.some(adjustment => adjustment.promotion_id !== promo.id) ||
      Math.abs(discounted - intent.points / 10) > 0.011) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Cart products no longer cover the loyalty discount')
    }
    const receipt = await loyalty.changePoints({
      customer_id: intent.customer_id, operation_key: `redeem:${cart.id}`, points: -intent.points, attempt_token: randomUUID(),
    })
    return new StepResponse(undefined, receipt.applied ? receipt : null)
  },
  async (receipt: ChangeReceipt | null, { container }) => {
    if (!receipt) return
    const loyalty: LoyaltyModuleService = container.resolve(LOYALTY_MODULE)
    await loyalty.reverseChange(receipt)
  }
)
