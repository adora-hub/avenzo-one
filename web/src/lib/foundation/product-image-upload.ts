import type { SupabaseClient } from '@supabase/supabase-js'
import { FoundationError } from './errors'

export const PRODUCT_IMAGE_BUCKET = 'product-images'
export const PRODUCT_IMAGE_MAX_BYTES = 5_242_880
export const PRODUCT_IMAGE_MAX_FILES = 9
export const PRODUCT_IMAGE_ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
] as const

export type PreparedProductImage = {
  entity_id: string
  product_id: string
  version: number
  storage_bucket: typeof PRODUCT_IMAGE_BUCKET
  storage_path: string
  upload_contract: {
    upsert: false
    cache_control: string
    max_bytes: number
    allowed_mime_types: string[]
  }
}

export function validateProductImageFile(file: Pick<File, 'name' | 'size' | 'type'>) {
  if (!file.name.trim() || file.name.length > 180
    || file.size < 1 || file.size > PRODUCT_IMAGE_MAX_BYTES
    || !PRODUCT_IMAGE_ALLOWED_MIME_TYPES.includes(
      file.type as typeof PRODUCT_IMAGE_ALLOWED_MIME_TYPES[number],
    )) {
    throw new FoundationError('validation_failed', 400)
  }
}

export async function uploadPreparedProductImage(
  client: SupabaseClient,
  reservation: PreparedProductImage,
  file: File,
) {
  validateProductImageFile(file)
  if (reservation.storage_bucket !== PRODUCT_IMAGE_BUCKET
    || reservation.upload_contract.upsert !== false
    || !reservation.upload_contract.allowed_mime_types.includes(file.type)
    || reservation.upload_contract.max_bytes < file.size) {
    throw new FoundationError('validation_failed', 400)
  }
  const { data, error } = await client.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(reservation.storage_path, file, {
      cacheControl: reservation.upload_contract.cache_control,
      contentType: file.type,
      upsert: false,
    })
  if (error) throw new FoundationError('foundation_command_failed', 500)
  return data
}
