import 'server-only'

import type { FoundationEntityCommand, FoundationCommandOutcome } from './contracts'
import { FoundationError } from './errors'
import { requireFoundationPermission } from './authorization'
import { getFoundationActor } from './server-context'
import { executeFoundationServerCommand } from './server-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRODUCT_IMAGE_BUCKET } from './product-image-upload'

type ProductImageCleanupCommand = FoundationEntityCommand & {
  commandType: 'product.image.fail' | 'product.image.archive'
  payload: {
    image_id: string
    expected_version: number
    failure_reason?: string
  }
}

export async function executeProductImageCleanupCommand(
  command: ProductImageCleanupCommand,
): Promise<FoundationCommandOutcome> {
  const actor = await getFoundationActor(command.organizationId)
  requireFoundationPermission(actor, 'product.create')

  const admin = createAdminClient()
  const { data: image, error: imageError } = await admin.from('product_images')
    .select('id, storage_bucket, storage_path, status, version')
    .eq('organization_id', command.organizationId)
    .eq('id', command.payload.image_id)
    .maybeSingle()
  if (imageError || !image) throw new FoundationError('entity_not_found', 404, command.commandId)
  if (Number(image.version) !== command.payload.expected_version) {
    throw new FoundationError('version_conflict', 409, command.commandId)
  }
  if (image.storage_bucket !== PRODUCT_IMAGE_BUCKET
    || (command.commandType === 'product.image.fail' && image.status !== 'uploading')
    || (command.commandType === 'product.image.archive' && image.status === 'archived')) {
    throw new FoundationError('invalid_state_transition', 409, command.commandId)
  }

  const { error: removeError } = await admin.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .remove([image.storage_path])
  if (removeError) throw new FoundationError('foundation_command_failed', 500, command.commandId)

  // If the DB command fails after removal, its immutable path remains safe and the
  // caller retries the same lifecycle transition; reads never expose non-ready rows.
  return executeFoundationServerCommand(command)
}
