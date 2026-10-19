import type { Context } from '@medusajs/framework/types'
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
} from '@medusajs/framework/utils'
import { Wishlist } from './models/wishlist'
import { WishlistItem } from './models/wishlist-item'

class WishlistModuleService extends MedusaService({ Wishlist, WishlistItem }) {
  // Both inserts commit together. A failed item insert cannot leave an orphan
  // wishlist, and unique conflicts are retried only after this transaction ends.
  @InjectManager()
  async insertItem(
    customerId: string,
    productId: string,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<void> {
    await this.insertItemTransaction(customerId, productId, sharedContext)
  }

  @InjectTransactionManager()
  protected async insertItemTransaction(
    customerId: string,
    productId: string,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<void> {
    const [existing] = await this.listWishlists({ customer_id: customerId }, {}, sharedContext)
    const wishlist = existing ?? await this.createWishlists({ customer_id: customerId }, sharedContext)
    const [item] = await this.listWishlistItems(
      { wishlist_id: wishlist.id, product_id: productId }, {}, sharedContext
    )
    if (!item) {
      await this.createWishlistItems({ wishlist_id: wishlist.id, product_id: productId }, sharedContext)
    }
  }
}

export default WishlistModuleService
