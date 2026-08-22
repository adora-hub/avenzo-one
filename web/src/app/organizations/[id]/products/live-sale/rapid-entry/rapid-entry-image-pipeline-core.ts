export type RapidImagePipelineStage =
  | 'staged'
  | 'preparing'
  | 'uploading'
  | 'finalizing'
  | 'ready'
  | 'failed'
  | 'compensation_pending'

export type RapidImageFile = {
  name: string
  type: string
  size: number
}

export type RapidCreatedProduct = {
  clientRowId: string
  productId: string
  productName: string
}

export type RapidStagedImage<TFile extends RapidImageFile = RapidImageFile> = {
  clientRowId: string
  file: TFile
}

export type RapidImageRecoveryItem = {
  clientRowId: string
  productId: string
  stage: RapidImagePipelineStage
  imageId?: string
  error?: string
}

export type RapidImagePipelineResult = {
  status: 'succeeded' | 'partial' | 'failed'
  readyCount: number
  failedCount: number
  compensationPendingCount: number
  items: RapidImageRecoveryItem[]
}

export type RapidImageReservation = {
  entity_id: string
  version: number
}

export type RapidImagePipelineDependencies<TFile extends RapidImageFile> = {
  validate: (file: TFile) => void
  prepare: (input: {
    commandId: string
    organizationId: string
    product: RapidCreatedProduct
    file: TFile
  }) => Promise<RapidImageReservation>
  upload: (reservation: RapidImageReservation, file: TFile) => Promise<void>
  finalize: (input: {
    commandId: string
    organizationId: string
    reservation: RapidImageReservation
  }) => Promise<{ ok: boolean; retryable?: boolean; error?: string }>
  reorder: (input: {
    commandId: string
    organizationId: string
    product: RapidCreatedProduct
    reservation: RapidImageReservation
  }) => Promise<{ ok: boolean; error?: string }>
  cleanup: (input: {
    commandId: string
    organizationId: string
    reservation: RapidImageReservation
    failureReason: string
  }) => Promise<{ ok: boolean }>
  newCommandId: () => string
}

type PipelineInput<TFile extends RapidImageFile> = {
  organizationId: string
  createdProducts: RapidCreatedProduct[]
  images: RapidStagedImage<TFile>[]
  previousItems?: RapidImageRecoveryItem[]
  onStage?: (item: RapidImageRecoveryItem) => void
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : 'rapid_image_upload_failed'
}

function emit(
  onStage: PipelineInput<RapidImageFile>['onStage'],
  item: RapidImageRecoveryItem,
) {
  onStage?.(item)
  return item
}

/** Pure orchestration core. Runtime adapters provide trusted commands and Storage. */
export async function runRapidEntryImagePipelineCore<TFile extends RapidImageFile>(
  {
    organizationId,
    createdProducts,
    images,
    previousItems = [],
    onStage,
  }: PipelineInput<TFile>,
  dependencies: RapidImagePipelineDependencies<TFile>,
): Promise<RapidImagePipelineResult> {
  const productsByRow = new Map(createdProducts.map((item) => [item.clientRowId, item]))
  const previousByRow = new Map(previousItems.map((item) => [item.clientRowId, item]))
  const stagedRows = new Set(images.map((item) => item.clientRowId))

  if (stagedRows.size !== images.length
    || images.some((image) => !productsByRow.has(image.clientRowId))) {
    throw new Error('rapid_image_mapping_invalid')
  }

  const results: RapidImageRecoveryItem[] = []
  for (const staged of images) {
    dependencies.validate(staged.file)
    const product = productsByRow.get(staged.clientRowId)!
    const previous = previousByRow.get(staged.clientRowId)
    if (previous?.stage === 'ready' && previous.productId === product.productId && previous.imageId) {
      results.push(emit(onStage, previous))
      continue
    }

    let reservation: RapidImageReservation | null = null
    let item = emit(onStage, {
      clientRowId: staged.clientRowId,
      productId: product.productId,
      stage: 'preparing',
    })

    try {
      reservation = await dependencies.prepare({
        commandId: dependencies.newCommandId(),
        organizationId,
        product,
        file: staged.file,
      })
      item = emit(onStage, { ...item, stage: 'uploading', imageId: reservation.entity_id })
      await dependencies.upload(reservation, staged.file)

      item = emit(onStage, { ...item, stage: 'finalizing' })
      const finalizeCommandId = dependencies.newCommandId()
      let finalize = await dependencies.finalize({
        commandId: finalizeCommandId,
        organizationId,
        reservation,
      })
      if (!finalize.ok && finalize.retryable) {
        finalize = await dependencies.finalize({
          commandId: finalizeCommandId,
          organizationId,
          reservation,
        })
      }
      if (!finalize.ok) throw new Error(finalize.error ?? 'rapid_image_finalize_failed')

      const reorder = await dependencies.reorder({
        commandId: dependencies.newCommandId(),
        organizationId,
        product,
        reservation,
      })
      if (!reorder.ok) throw new Error(reorder.error ?? 'rapid_image_reorder_failed')
      results.push(emit(onStage, { ...item, stage: 'ready' }))
    } catch (error) {
      const failureReason = safeMessage(error)
      if (!reservation) {
        results.push(emit(onStage, { ...item, stage: 'failed', error: failureReason }))
        continue
      }
      const cleanup = await dependencies.cleanup({
        commandId: dependencies.newCommandId(),
        organizationId,
        reservation,
        failureReason,
      })
      results.push(emit(onStage, {
        ...item,
        stage: cleanup.ok ? 'failed' : 'compensation_pending',
        error: cleanup.ok ? failureReason : `${failureReason}:cleanup_pending`,
      }))
    }
  }

  const readyCount = results.filter((item) => item.stage === 'ready').length
  const compensationPendingCount = results.filter((item) => item.stage === 'compensation_pending').length
  const failedCount = results.length - readyCount
  return {
    status: failedCount === 0 ? 'succeeded' : readyCount > 0 ? 'partial' : 'failed',
    readyCount,
    failedCount,
    compensationPendingCount,
    items: results,
  }
}
