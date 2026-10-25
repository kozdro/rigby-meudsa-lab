import type { Context } from '@medusajs/framework/types'
import type { EntityManager } from '@medusajs/framework/mikro-orm/knex'
import { LockMode } from '@medusajs/framework/mikro-orm/core'
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from '@medusajs/framework/utils'
import { LoyaltyPoint } from './models/loyalty-point'
import { LoyaltyEntry } from './models/loyalty-entry'
import { LoyaltyRedemption } from './models/loyalty-redemption'

export type PointsChange = {
  customer_id: string
  operation_key: string
  points: number
  attempt_token?: string
}

export type ChangeReceipt = {
  entry_id: string
  applied: boolean
  attempt_token: string | null
}

type LockedAccount = { id: string; points: number }

class LoyaltyModuleService extends MedusaService({ LoyaltyPoint, LoyaltyEntry, LoyaltyRedemption }) {
  async getPoints(customerId: string): Promise<number> {
    const [account] = await this.listLoyaltyPoints({ customer_id: customerId })
    return account?.points ?? 0
  }

  // Account creation is harmless outside the balance transaction. A concurrent
  // first award may create the same unique customer account; both then lock it.
  private async ensureAccount(customerId: string): Promise<string> {
    const [existing] = await this.listLoyaltyPoints({ customer_id: customerId })
    if (existing) return existing.id
    try {
      return (await this.createLoyaltyPoints({ customer_id: customerId })).id
    } catch (error) {
      const [concurrent] = await this.listLoyaltyPoints({ customer_id: customerId })
      if (!concurrent) throw error
      return concurrent.id
    }
  }

  @InjectManager()
  async changePoints(
    input: PointsChange,
    @MedusaContext() sharedContext: Context<EntityManager> = {}
  ): Promise<ChangeReceipt> {
    if (!Number.isSafeInteger(input.points) || input.points === 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Points must be a non-zero integer')
    }
    const accountId = await this.ensureAccount(input.customer_id)
    return this.changePointsTransaction(input, accountId, sharedContext)
  }

  @InjectTransactionManager()
  protected async changePointsTransaction(
    input: PointsChange,
    accountId: string,
    @MedusaContext() sharedContext: Context<EntityManager> = {}
  ): Promise<ChangeReceipt> {
    const manager = sharedContext.transactionManager!
    const account = await manager.findOne<LockedAccount>('LoyaltyPoint', { id: accountId }, {
      lockMode: LockMode.PESSIMISTIC_WRITE,
      refresh: true,
    })
    if (!account) throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Loyalty account not found')
    const [entry] = await this.listLoyaltyEntries({ operation_key: input.operation_key }, {}, sharedContext)
    if (entry && (entry.customer_id !== input.customer_id || entry.points !== input.points)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Loyalty operation does not match its receipt')
    }
    if (entry?.state === 'applied') {
      return { entry_id: entry.id, applied: false, attempt_token: entry.attempt_token }
    }
    const points = Number(account.points) + input.points
    if (!Number.isSafeInteger(points) || points < 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Insufficient loyalty points')
    }
    // The account update and unique operation receipt commit or roll back together.
    await this.updateLoyaltyPoints({ id: accountId, points }, sharedContext)
    const receipt = entry
      ? await this.updateLoyaltyEntries({ id: entry.id, state: 'applied', attempt_token: input.attempt_token ?? null }, sharedContext)
      : await this.createLoyaltyEntries({ ...input, attempt_token: input.attempt_token ?? null }, sharedContext)
    return { entry_id: receipt.id, applied: true, attempt_token: receipt.attempt_token }
  }

  @InjectManager()
  async reverseChange(
    input: { entry_id: string; attempt_token: string | null },
    @MedusaContext() sharedContext: Context<EntityManager> = {}
  ): Promise<void> {
    const entry = await this.retrieveLoyaltyEntry(input.entry_id)
    const accountId = await this.ensureAccount(entry.customer_id)
    await this.reverseChangeTransaction(input, accountId, sharedContext)
  }

  @InjectTransactionManager()
  protected async reverseChangeTransaction(
    input: { entry_id: string; attempt_token: string | null },
    accountId: string,
    @MedusaContext() sharedContext: Context<EntityManager> = {}
  ): Promise<void> {
    const account = await sharedContext.transactionManager!.findOne<LockedAccount>('LoyaltyPoint', { id: accountId }, {
      lockMode: LockMode.PESSIMISTIC_WRITE,
      refresh: true,
    })
    const entry = await this.retrieveLoyaltyEntry(input.entry_id, {}, sharedContext)
    if (!account || entry.state !== 'applied' || entry.attempt_token !== input.attempt_token) return
    const points = Number(account.points) - entry.points
    if (points < 0) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, 'Earned points have already been spent')
    await this.updateLoyaltyPoints({ id: accountId, points }, sharedContext)
    await this.updateLoyaltyEntries({ id: entry.id, state: 'reversed' }, sharedContext)
  }
}

export default LoyaltyModuleService
