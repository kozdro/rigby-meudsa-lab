import {
  authenticate,
  configureStoreSearch,
  defineMiddlewares,
  validateAndTransformBody,
} from '@medusajs/framework/http'
import { AddWishlistItemSchema } from './store/wishlist/validators'
import { ApplyLoyaltyPointsSchema } from './store/carts/[id]/loyalty-points/validators'

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
    {
      matcher: '/store/carts/:id/loyalty-points',
      middlewares: [authenticate('customer', ['session', 'bearer'])],
    },
    {
      matcher: '/store/carts/:id/loyalty-points',
      method: 'POST',
      middlewares: [validateAndTransformBody(ApplyLoyaltyPointsSchema)],
    },
    {
      matcher: '/store/wishlist*',
      middlewares: [authenticate('customer', ['session', 'bearer'])],
    },
    {
      matcher: '/store/wishlist/items',
      method: 'POST',
      middlewares: [validateAndTransformBody(AddWishlistItemSchema)],
    },
    {
      method: ['POST'],
      matcher: '/store/search',
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            product: true,
          },
        }),
      ],
    },
  ],
})
