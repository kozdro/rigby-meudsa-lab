// Policy-only tests. PostgreSQL, native order completion, promotions and event
// idempotency are separately exercised by integration-tests/live/loyalty.ts.
jest.mock('@medusajs/framework/workflows-sdk', () => ({
  createStep: (_name: string, handler: unknown) => handler,
  createWorkflow: () => ({}),
  StepResponse: class {
    constructor(readonly output: unknown) {}
  },
  WorkflowResponse: class {},
}))

import { awardCapturedOrderPointsStep } from '../../../workflows/loyalty/award-points'
import { ApplyLoyaltyPointsSchema } from '../../../api/store/carts/[id]/loyalty-points/validators'

type CapturedOrder = {
  id: string
  customer_id: string | null
  currency_code: string
  status: string
  item_total: number
  total?: number
  shipping_total?: number
  payment_collections: { status: string }[]
}

const paidOrder = (overrides: Partial<CapturedOrder> = {}): CapturedOrder => ({
  id: 'order_policy',
  customer_id: 'cus_policy',
  currency_code: 'eur',
  status: 'pending',
  item_total: 123.99,
  total: 141.99,
  shipping_total: 18,
  payment_collections: [{ status: 'completed' }],
  ...overrides,
})

function fixture(order = paidOrder(), captured = true, linked = true) {
  const changePoints = jest.fn().mockResolvedValue({ entry_id: 'entry_policy', applied: true, attempt_token: null })
  const graph = jest.fn()
    .mockResolvedValueOnce({ data: [{ id: 'pay_policy', captured_at: captured ? new Date().toISOString() : null, payment_collection_id: 'paycol_policy' }] })
    .mockResolvedValueOnce({ data: linked ? [{ order: { id: order.id } }] : [] })
    .mockResolvedValueOnce({ data: [order] })
  const container = { resolve: (name: string) => name === 'query' ? { graph } : { changePoints } }
  const invoke = awardCapturedOrderPointsStep as unknown as (
    input: { payment_id: string }, context: { container: typeof container }
  ) => Promise<unknown>
  return { changePoints, graph, run: () => invoke({ payment_id: 'pay_policy' }, { container }) }
}

describe('capture-only EUR earning policy', () => {
  it('does not award for an authorized payment without a captured timestamp', async () => {
    const { run, changePoints, graph } = fixture(paidOrder(), false)
    await run()
    expect(changePoints).not.toHaveBeenCalled()
    expect(graph).toHaveBeenCalledTimes(1)
  })

  it('does not award a captured payment that is not linked to an order', async () => {
    const { run, changePoints } = fixture(paidOrder(), true, false)
    await run()
    expect(changePoints).not.toHaveBeenCalled()
  })

  it.each([
    ['non-EUR order', { currency_code: 'usd' }],
    ['guest order', { customer_id: null }],
    ['canceled order', { status: 'canceled' }],
    ['partially captured collection', { payment_collections: [{ status: 'partially_captured' }] }],
    ['second collection remains unpaid', { payment_collections: [{ status: 'completed' }, { status: 'authorized' }] }],
  ] as const)('does not award for %s', async (_label, overrides) => {
    const { run, changePoints } = fixture(paidOrder(overrides as Partial<CapturedOrder>))
    await run()
    expect(changePoints).not.toHaveBeenCalled()
  })

  it('earns only full euros of discounted product value including VAT and excludes shipping', async () => {
    const { run, changePoints } = fixture(paidOrder({ item_total: 123.99, shipping_total: 18, total: 141.99 }))
    await run()
    expect(changePoints).toHaveBeenCalledWith({
      customer_id: 'cus_policy', operation_key: 'earn:order_policy', points: 123,
    })
  })

  it('does not turn a fractional euro into a point', async () => {
    const { run, changePoints } = fixture(paidOrder({ item_total: 0.99, total: 20.99 }))
    await run()
    expect(changePoints).not.toHaveBeenCalled()
  })

  it('earns on the remaining product value of an order paid with loyalty discounts', async () => {
    const { run, changePoints } = fixture(paidOrder({ item_total: 90.75, total: 110.75 }))
    await run()
    expect(changePoints).toHaveBeenCalledWith(expect.objectContaining({ points: 90 }))
  })

  it('awards when every payment collection has completed capture', async () => {
    const { run, changePoints } = fixture(paidOrder({ payment_collections: [{ status: 'completed' }, { status: 'completed' }] }))
    await run()
    expect(changePoints).toHaveBeenCalledTimes(1)
  })

  it('propagates a balance persistence failure for subscriber retry', async () => {
    const { run, changePoints } = fixture()
    const unavailable = new Error('Loyalty persistence unavailable')
    changePoints.mockRejectedValueOnce(unavailable)
    await expect(run()).rejects.toBe(unavailable)
  })
})

describe('whole-block redemption input', () => {
  it.each([100, 200, 1000])('accepts %d whole points', points => {
    expect(ApplyLoyaltyPointsSchema.safeParse({ points }).success).toBe(true)
  })

  it.each([0, -100, 1, 99, 101, 100.5, Number.MAX_SAFE_INTEGER + 1, '100', null, undefined])(
    'rejects invalid redemption %s', points => {
      expect(ApplyLoyaltyPointsSchema.safeParse({ points }).success).toBe(false)
    }
  )
})
