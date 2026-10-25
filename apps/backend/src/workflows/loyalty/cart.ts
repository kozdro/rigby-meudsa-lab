import { randomUUID } from 'node:crypto'
import type { CreatePromotionDTO, RemoteQueryFunction } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, MedusaError, PromotionActions } from '@medusajs/framework/utils'
import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from '@medusajs/framework/workflows-sdk'
import {
  acquireLockStep,
  createPromotionsStep,
  releaseLockStep,
  updateCartPromotionsWorkflow,
  updateCartsStep,
  updatePromotionsStep,
  useQueryGraphStep,
} from '@medusajs/medusa/core-flows'
import LoyaltyModuleService from '../../modules/loyalty/service'
import { LOYALTY_MODULE } from '../../modules/loyalty'

export const loyaltyCartFields = [
  'id', 'customer_id', 'currency_code', 'completed_at', 'metadata',
  'item_total', 'subtotal', 'discount_total', 'tax_total', 'shipping_total', 'total',
  'items.*', 'items.total', 'shipping_methods.*',
  'promotions.*', 'promotions.application_method.*',
]

export type LoyaltyCartInput = { cart_id: string; customer_id: string }

const prepareLoyaltyCartStep = createStep(
  'prepare-loyalty-cart',
  async (input: LoyaltyCartInput & { points?: number }, { container }) => {
    const query = container.resolve<RemoteQueryFunction>(ContainerRegistrationKeys.QUERY)
    const { data: carts } = await query.graph({
      entity: 'cart', fields: loyaltyCartFields, filters: { id: input.cart_id },
    })
    const cart = carts[0]
    if (!cart) throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Cart not found')
    if (cart.customer_id !== input.customer_id) throw new MedusaError(MedusaError.Types.FORBIDDEN, 'Cart belongs to another customer')
    if (cart.completed_at) throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Cart is already completed')
    if (cart.currency_code !== 'eur') throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Loyalty supports EUR only')
    const loyalty: LoyaltyModuleService = container.resolve(LOYALTY_MODULE)
    const [redemption] = await loyalty.listLoyaltyRedemptions({ cart_id: input.cart_id })
    if (input.points !== undefined) {
      if (!Number.isSafeInteger(input.points) || input.points < 100 || input.points % 100 !== 0) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Redeem whole blocks of 100 points')
      }
      if (redemption?.active) throw new MedusaError(MedusaError.Types.CONFLICT, 'Loyalty discount already applied')
      if (await loyalty.getPoints(input.customer_id) < input.points) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Insufficient loyalty points')
      }
      if (Number(cart.item_total) < input.points / 10) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Products must cover the whole loyalty discount')
      }
    } else if (!redemption?.active) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, 'No loyalty discount applied')
    }
    return new StepResponse({ cart, redemption })
  }
)

const saveLoyaltyRedemptionStep = createStep(
  'save-loyalty-redemption',
  async (input: { cart_id: string; customer_id: string; promotion_id: string; points: number }, { container }) => {
    const loyalty: LoyaltyModuleService = container.resolve(LOYALTY_MODULE)
    const [previous] = await loyalty.listLoyaltyRedemptions({ cart_id: input.cart_id })
    const saved = previous
      ? await loyalty.updateLoyaltyRedemptions({ id: previous.id, ...input, active: true })
      : await loyalty.createLoyaltyRedemptions(input)
    return new StepResponse(saved, { id: saved.id, previous })
  },
  async (data, { container }) => {
    if (!data) return
    const loyalty: LoyaltyModuleService = container.resolve(LOYALTY_MODULE)
    if (data.previous) {
      const { id, cart_id, customer_id, promotion_id, points, active } = data.previous
      await loyalty.updateLoyaltyRedemptions({ id, cart_id, customer_id, promotion_id, points, active })
    } else {
      await loyalty.deleteLoyaltyRedemptions(data.id)
    }
  }
)

const deactivateLoyaltyRedemptionStep = createStep(
  'deactivate-loyalty-redemption',
  async ({ id }: { id: string }, { container }) => {
    const loyalty: LoyaltyModuleService = container.resolve(LOYALTY_MODULE)
    await loyalty.updateLoyaltyRedemptions({ id, active: false })
    return new StepResponse(undefined, id)
  },
  async (id, { container }) => {
    if (!id) return
    const loyalty: LoyaltyModuleService = container.resolve(LOYALTY_MODULE)
    await loyalty.updateLoyaltyRedemptions({ id, active: true })
  }
)

export const applyLoyaltyOnCartWorkflow = createWorkflow(
  'apply-loyalty-on-cart',
  function (input: LoyaltyCartInput & { points: number }) {
    // Share core cart completion's lock across the entire mutation, including
    // the promotion intent. Nested native promotion updates skip their lock.
    acquireLockStep({ key: input.cart_id, timeout: 30, ttl: 120, executeOnSubWorkflow: true })
    const prepared = prepareLoyaltyCartStep(input)
    const promo = transform({ input, prepared }, ({ input }) => {
      const code = `LOYALTY-${randomUUID()}`
      return [{
        code,
        type: 'standard',
        status: 'active',
        is_tax_inclusive: true,
        application_method: {
          type: 'fixed', value: input.points / 10, target_type: 'order', currency_code: 'eur', allocation: 'across',
        },
        rules: [{ attribute: 'customer_id', operator: 'eq', values: [input.customer_id] }],
        campaign: { name: code, campaign_identifier: code, budget: { type: 'usage', limit: 1 } },
      }] as CreatePromotionDTO[]
    })
    const promotions = createPromotionsStep(promo)
    const updateInput = transform({ input, promotions }, ({ input, promotions }) => ({
      cart_id: input.cart_id, promo_codes: [promotions[0].code!], action: PromotionActions.ADD,
    }))
    updateCartPromotionsWorkflow.runAsStep({ input: updateInput })
    const redemptionInput = transform({ input, promotions }, ({ input, promotions }) => ({ ...input, promotion_id: promotions[0].id }))
    saveLoyaltyRedemptionStep(redemptionInput)
    const cartMetadata = transform({ input, prepared, promotions }, ({ input, prepared, promotions }) => [{
      id: input.cart_id, metadata: { ...prepared.cart.metadata, loyalty_promo_id: promotions[0].id },
    }])
    updateCartsStep(cartMetadata)
    const { data: carts } = useQueryGraphStep({
      entity: 'cart', fields: loyaltyCartFields, filters: { id: input.cart_id },
    })
    releaseLockStep({ key: input.cart_id, executeOnSubWorkflow: true })
    return new WorkflowResponse(carts[0])
  }
)

export const removeLoyaltyFromCartWorkflow = createWorkflow(
  'remove-loyalty-from-cart',
  function (input: LoyaltyCartInput) {
    acquireLockStep({ key: input.cart_id, timeout: 30, ttl: 120, executeOnSubWorkflow: true })
    const prepared = prepareLoyaltyCartStep(input)
    const promotion = useQueryGraphStep({
      entity: 'promotion', fields: ['id', 'code'], filters: { id: prepared.redemption.promotion_id },
    })
    const updateInput = transform({ input, promotion }, ({ input, promotion }) => ({
      cart_id: input.cart_id, promo_codes: [promotion.data[0].code!], action: PromotionActions.REMOVE,
    }))
    updateCartPromotionsWorkflow.runAsStep({ input: updateInput })
    updatePromotionsStep([{ id: prepared.redemption.promotion_id, status: 'inactive' }])
    deactivateLoyaltyRedemptionStep({ id: prepared.redemption.id })
    const cartMetadata = transform({ input, prepared }, ({ input, prepared }) => [{
      id: input.cart_id, metadata: { ...prepared.cart.metadata, loyalty_promo_id: null },
    }])
    updateCartsStep(cartMetadata)
    const { data: carts } = useQueryGraphStep({
      entity: 'cart', fields: loyaltyCartFields, filters: { id: input.cart_id },
    }).config({ name: 'retrieve-updated-loyalty-cart' })
    releaseLockStep({ key: input.cart_id, executeOnSubWorkflow: true })
    return new WorkflowResponse(carts[0])
  }
)
