import { createWorkflow, WorkflowResponse } from '@medusajs/framework/workflows-sdk'
import { removeWishlistItemStep } from './steps/wishlist'
import type { WishlistMutation } from './wishlist/mutations'

export const removeWishlistItemWorkflow = createWorkflow(
  'remove-wishlist-item',
  function (input: WishlistMutation) {
    const result = removeWishlistItemStep(input)
    return new WorkflowResponse(result)
  }
)
