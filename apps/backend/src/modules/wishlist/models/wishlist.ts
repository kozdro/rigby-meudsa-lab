import { model } from '@medusajs/framework/utils'
import { WishlistItem } from './wishlist-item'

export const Wishlist = model.define('wishlist', {
  id: model.id({ prefix: 'wish' }).primaryKey(),
  customer_id: model.text(),
  items: model.hasMany(() => WishlistItem, { mappedBy: 'wishlist' }),
}).indexes([{ on: ['customer_id'], unique: true }])
