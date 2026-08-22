'use client'

import {
  executeFoundationCommandAction,
  executeProductImageCleanupAction,
} from '@/app/actions/foundation'
import { createClient } from '@/lib/supabase/browser'
import {
  uploadPreparedProductImage,
  validateProductImageFile,
  type PreparedProductImage,
} from '@/lib/foundation/product-image-upload'
import {
  runRapidEntryImagePipelineCore,
  type RapidCreatedProduct,
  type RapidImagePipelineResult,
  type RapidImageRecoveryItem,
  type RapidStagedImage,
} from './rapid-entry-image-pipeline-core'

export type {
  RapidCreatedProduct,
  RapidImagePipelineResult,
  RapidImageRecoveryItem,
  RapidImagePipelineStage,
  RapidStagedImage,
} from './rapid-entry-image-pipeline-core'

type PipelineInput = {
  organizationId: string
  createdProducts: RapidCreatedProduct[]
  images: RapidStagedImage<File>[]
  previousItems?: RapidImageRecoveryItem[]
  onStage?: (item: RapidImageRecoveryItem) => void
}

/**
 * Runs the approved R6 private-image lifecycle for Rapid Entry.
 *
 * Product/SKU creation remains the database transaction boundary. Storage is
 * deliberately handled afterwards because a Storage upload cannot participate
 * in that PostgreSQL transaction. Ready rows are skipped on retry, while every
 * failed upload is compensated through the trusted server cleanup boundary.
 */
export async function runRapidEntryImagePipeline({
  organizationId,
  createdProducts,
  images,
  previousItems = [],
  onStage,
}: PipelineInput): Promise<RapidImagePipelineResult> {
  const supabase = createClient()
  return runRapidEntryImagePipelineCore({
    organizationId, createdProducts, images, previousItems, onStage,
  }, {
    validate: validateProductImageFile,
    newCommandId: () => crypto.randomUUID(),
    prepare: async ({ commandId, organizationId: scopedOrganizationId, product, file }) => {
      const prepare = await executeFoundationCommandAction({
        kind: 'entity',
        commandId,
        organizationId: scopedOrganizationId,
        commandType: 'product.image.prepare',
        payload: {
          product_id: product.productId,
          original_file_name: file.name,
          mime_type: file.type,
          file_size_bytes: file.size,
          alt_text: `${product.productName} รูปปก`.slice(0, 160),
        },
      })
      if (!prepare.ok) throw new Error(prepare.error)
      return prepare.data as PreparedProductImage
    },
    upload: async (reservation, file) => {
      await uploadPreparedProductImage(
        supabase,
        reservation as PreparedProductImage,
        file,
      )
    },
    finalize: async ({ commandId, organizationId: scopedOrganizationId, reservation }) => {
      const finalize = await executeFoundationCommandAction({
        kind: 'entity', commandId, organizationId: scopedOrganizationId,
        commandType: 'product.image.finalize',
        payload: { image_id: reservation.entity_id, expected_version: reservation.version },
      })
      return { ok: finalize.ok, retryable: !finalize.ok && finalize.status >= 500, error: finalize.ok ? undefined : finalize.error }
    },
    reorder: async ({ commandId, organizationId: scopedOrganizationId, product, reservation }) => {
      const reorder = await executeFoundationCommandAction({
        kind: 'entity', commandId, organizationId: scopedOrganizationId,
        commandType: 'product.images.reorder',
        payload: {
          product_id: product.productId,
          image_ids: [reservation.entity_id],
          cover_image_id: reservation.entity_id,
        },
      })
      return { ok: reorder.ok, error: reorder.ok ? undefined : reorder.error }
    },
    cleanup: async ({ commandId, organizationId: scopedOrganizationId, reservation, failureReason }) => {
      const cleanup = await executeProductImageCleanupAction({
        kind: 'entity', commandId, organizationId: scopedOrganizationId,
        commandType: 'product.image.fail',
        payload: {
          image_id: reservation.entity_id,
          expected_version: reservation.version,
          failure_reason: failureReason,
        },
      })
      return { ok: cleanup.ok }
    },
  })
}
