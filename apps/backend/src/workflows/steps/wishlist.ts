import { createStep, StepResponse } from '@medusajs/framework/workflows-sdk'
import {
  addWishlistItem,
  removeWishlistItem,
  validateWishlistProduct,
  type WishlistMutation,
} from '../wishlist/mutations'

export const validateWishlistProductStep = createStep(
  'validate-wishlist-product',
  async (input: WishlistMutation, { container }) => {
    await validateWishlistProduct(container, input)
    return new StepResponse(input)
  }
)

// Each workflow ends with one atomic persistence operation. There is no later
// fallible step requiring compensation, and idempotent adds must never roll
// back a row created by another request.
export const addWishlistItemStep = createStep(
  'add-wishlist-item',
  async (input: WishlistMutation, { container }) => {
    await addWishlistItem(container, input)
    return new StepResponse(null)
  }
)

export const removeWishlistItemStep = createStep(
  'remove-wishlist-item',
  async (input: WishlistMutation, { container }) => {
    await removeWishlistItem(container, input)
    return new StepResponse(null)
  }
)
