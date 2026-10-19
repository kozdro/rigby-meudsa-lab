import { model } from '@medusajs/framework/utils'
import { Wishlist } from './wishlist'

export const WishlistItem = model.define('wishlist_item', {
  id: model.id({ prefix: 'wishitem' }).primaryKey(),
  product_id: model.text(),
  wishlist: model.belongsTo(() => Wishlist, { mappedBy: 'items' }),
}).indexes([{ on: ['wishlist_id', 'product_id'], unique: true }])
