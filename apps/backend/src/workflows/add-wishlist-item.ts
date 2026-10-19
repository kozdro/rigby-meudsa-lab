import { createWorkflow, WorkflowResponse } from '@medusajs/framework/workflows-sdk'
import { addWishlistItemStep, validateWishlistProductStep } from './steps/wishlist'
import type { WishlistMutation } from './wishlist/mutations'

export const addWishlistItemWorkflow = createWorkflow(
  'add-wishlist-item',
  function (input: WishlistMutation) {
    const validated = validateWishlistProductStep(input)
    const result = addWishlistItemStep(validated)
    return new WorkflowResponse(result)
  }
)
