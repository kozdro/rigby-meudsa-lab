import type { MedusaContainer } from '@medusajs/framework/types'
import { MedusaError } from '@medusajs/framework/utils'
import { AddWishlistItemSchema } from '../../../api/store/wishlist/validators'
import { addWishlistItem, removeWishlistItem, validateWishlistProduct } from '../mutations'
import { readWishlist, visibleProducts } from '../read'

function fixture() {
  const service = {
    insertItem: jest.fn().mockResolvedValue(undefined),
    listWishlists: jest.fn().mockResolvedValue([]),
    listWishlistItems: jest.fn().mockResolvedValue([]),
    deleteWishlistItems: jest.fn().mockResolvedValue(undefined),
  }
  const graph = jest.fn().mockResolvedValue({ data: [] })
  const container = {
    resolve: (name: string) => name === 'wishlist' ? service : { graph },
  } as unknown as MedusaContainer
  return { service, graph, container }
}

const input = { customer_id: 'customer_self', product_id: 'prod_1', sales_channel_ids: ['sc_1'] }
const uniqueError = () => new MedusaError(MedusaError.Types.INVALID_DATA, 'wishlist, already exists.')

describe('wishlist ownership, visibility and idempotency', () => {
  it('rejects blank IDs and client-supplied ownership', () => {
    expect(AddWishlistItemSchema.safeParse({ product_id: ' ' }).success).toBe(false)
    expect(AddWishlistItemSchema.safeParse({ product_id: 'prod_1', customer_id: 'victim' }).success).toBe(false)
    expect(AddWishlistItemSchema.safeParse({ product_id: 'prod_1', wishlist_id: 'victim' }).success).toBe(false)
  })

  it('does not mutate when reading an absent wishlist', async () => {
    const { container, service } = fixture()
    expect(await readWishlist(container, input)).toEqual({ wishlist: null })
    expect(service.listWishlists).toHaveBeenCalledWith(
      { customer_id: 'customer_self' }, { relations: ['items'], take: 1 }
    )
    expect(service.insertItem).not.toHaveBeenCalled()
  })

  it('never queries unscoped products without sales channels', async () => {
    const { container, graph } = fixture()
    expect(await visibleProducts(container, ['prod_1'], [])).toEqual([])
    expect(graph).not.toHaveBeenCalled()
  })

  it('scopes link IDs and then requires published products', async () => {
    const { container, graph } = fixture()
    graph.mockResolvedValueOnce({ data: [{ product_id: 'prod_1' }] })
    graph.mockResolvedValueOnce({ data: [] })
    await expect(validateWishlistProduct(container, input)).rejects.toMatchObject({ type: 'not_found' })
    expect(graph.mock.calls[0][0].filters).toEqual({ product_id: ['prod_1'], sales_channel_id: ['sc_1'] })
    expect(graph.mock.calls[1][0].filters).toEqual({ id: ['prod_1'], status: 'published' })
  })

  it('rejects unknown and cross-channel products without querying their details', async () => {
    const { container, graph } = fixture()
    await expect(validateWishlistProduct(container, input)).rejects.toMatchObject({ type: 'not_found' })
    expect(graph).toHaveBeenCalledTimes(1)
  })

  it('redacts withdrawn product details but preserves the removable saved identity', async () => {
    const { container, service } = fixture()
    service.listWishlists.mockResolvedValue([{ id: 'wish_1', items: [{ id: 'item_1', product_id: 'prod_1' }] }])
    expect(await readWishlist(container, input)).toEqual({
      wishlist: { id: 'wish_1', items: [{ id: 'item_1', product_id: 'prod_1', product: null }] },
    })
  })

  it('accepts a duplicate created by a concurrent committed transaction', async () => {
    const { container, service } = fixture()
    service.insertItem.mockRejectedValueOnce(uniqueError())
    service.listWishlists.mockResolvedValue([{ id: 'wish_self' }])
    service.listWishlistItems.mockResolvedValue([{ id: 'item_existing' }])
    await addWishlistItem(container, input)
    expect(service.insertItem).toHaveBeenCalledTimes(1)
    expect(service.listWishlistItems).toHaveBeenCalledWith({ wishlist_id: 'wish_self', product_id: 'prod_1' })
    expect(service.deleteWishlistItems).not.toHaveBeenCalled()
  })

  it('retries after a concurrent first add created the wishlist for another product', async () => {
    const { container, service } = fixture()
    service.insertItem.mockRejectedValueOnce(uniqueError())
    service.listWishlists.mockResolvedValue([{ id: 'wish_self' }])
    await addWishlistItem(container, input)
    expect(service.insertItem).toHaveBeenCalledTimes(2)
    expect(service.insertItem).toHaveBeenLastCalledWith('customer_self', 'prod_1')
  })

  it('does not hide unrelated database failures', async () => {
    const { container, service } = fixture()
    const failure = new Error('connection unavailable')
    service.insertItem.mockRejectedValue(failure)
    await expect(addWishlistItem(container, input)).rejects.toBe(failure)
    expect(service.listWishlists).not.toHaveBeenCalled()
  })

  it('does not hide a conflict without a corresponding persisted wishlist', async () => {
    const { container, service } = fixture()
    const failure = uniqueError()
    service.insertItem.mockRejectedValue(failure)
    await expect(addWishlistItem(container, input)).rejects.toBe(failure)
  })

  it('bounds retries for unresolved unique conflicts', async () => {
    const { container, service } = fixture()
    service.insertItem.mockRejectedValue(uniqueError())
    service.listWishlists.mockResolvedValue([{ id: 'wish_self' }])
    await expect(addWishlistItem(container, input)).rejects.toMatchObject({ type: 'invalid_data' })
    expect(service.insertItem).toHaveBeenCalledTimes(3)
  })

  it('deletes by authenticated owner and product, never by an unrestricted item ID', async () => {
    const { container, service } = fixture()
    service.listWishlists.mockResolvedValue([{ id: 'wish_self' }])
    await removeWishlistItem(container, input)
    expect(service.listWishlists).toHaveBeenCalledWith({ customer_id: 'customer_self' })
    expect(service.deleteWishlistItems).toHaveBeenCalledWith({ wishlist_id: 'wish_self', product_id: 'prod_1' })
  })

  it('idempotently deletes before any wishlist was created', async () => {
    const { container, service } = fixture()
    await removeWishlistItem(container, input)
    expect(service.deleteWishlistItems).not.toHaveBeenCalled()
  })
})
