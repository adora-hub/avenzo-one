'use client'

import Image from 'next/image'
import { IconTrash, IconUpload, IconX } from '@tabler/icons-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import type { ProductWorkspaceDetail } from '@/lib/foundation/repositories'
import {
  PRODUCT_IMAGE_ALLOWED_MIME_TYPES,
  PRODUCT_IMAGE_MAX_FILES,
  validateProductImageFile,
} from '@/lib/foundation/product-image-upload'

type ImageManagerItem = {
  id: string
  name: string
  previewUrl: string
  isCover: boolean
  source: 'saved' | 'new' | 'replacement'
}

function PhotoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m5 18 5-5 3 3 2-2 4 4" /></svg>
}

function ArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={direction === 'left' ? 'm12.5 4.5-5 5 5 5' : 'm7.5 4.5 5 5-5 5'} /></svg>
}

function StarIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 2.8 2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7Z" /></svg>
}

function initialItems(product: ProductWorkspaceDetail): ImageManagerItem[] {
  return product.images.map((image, index) => ({
    id: image.id,
    name: image.altText || `รูปภาพที่ ${index + 1}`,
    previewUrl: image.signedUrl,
    isCover: image.isCover || (!product.images.some((entry) => entry.isCover) && index === 0),
    source: 'saved',
  }))
}

export function ProductImageManagerModal({
  product,
  onClose,
}: {
  product: ProductWorkspaceDetail
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const objectUrlsRef = useRef(new Set<string>())
  const [items, setItems] = useState<ImageManagerItem[]>(() => initialItems(product))
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [draggedItemId, setDraggedItemId] = useState('')
  const [error, setError] = useState('')
  const coverItem = useMemo(() => items.find((item) => item.isCover) ?? null, [items])

  useEffect(() => {
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('button, [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')
    firstFocusable?.focus()
    const urls = objectUrlsRef.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
      .filter((element) => element.offsetParent !== null)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function normalizeCover(nextItems: ImageManagerItem[]) {
    if (!nextItems.length || nextItems.some((item) => item.isCover)) return nextItems
    return nextItems.map((item, index) => ({ ...item, isCover: index === 0 }))
  }

  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (!files.length) return
    const slots = PRODUCT_IMAGE_MAX_FILES - items.length
    if (slots <= 0) {
      setError(`เพิ่มรูปได้สูงสุด ${PRODUCT_IMAGE_MAX_FILES} รูป`)
      return
    }
    const accepted: ImageManagerItem[] = []
    for (const file of files.slice(0, slots)) {
      try {
        validateProductImageFile(file)
        const previewUrl = URL.createObjectURL(file)
        objectUrlsRef.current.add(previewUrl)
        accepted.push({
          id: `new-${crypto.randomUUID()}`,
          name: file.name,
          previewUrl,
          isCover: false,
          source: 'new',
        })
      } catch {
        setError('รองรับเฉพาะ JPEG, PNG หรือ WebP ขนาดไม่เกิน 5 MB ต่อภาพ')
      }
    }
    if (files.length > slots) setError(`เลือกได้อีก ${slots} รูป และเพิ่มรูปได้สูงสุด ${PRODUCT_IMAGE_MAX_FILES} รูป`)
    else if (accepted.length === files.length) setError('')
    if (accepted.length) setItems((current) => normalizeCover([...current, ...accepted]))
  }

  function replaceImage(itemId: string, fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    try {
      validateProductImageFile(file)
      const previewUrl = URL.createObjectURL(file)
      objectUrlsRef.current.add(previewUrl)
      setItems((current) => current.map((item) => item.id === itemId ? {
        ...item,
        name: file.name,
        previewUrl,
        source: 'replacement',
      } : item))
      setError('')
    } catch {
      setError('รูปที่ใช้แทนต้องเป็น JPEG, PNG หรือ WebP ขนาดไม่เกิน 5 MB')
    }
  }

  function removeImage(itemId: string) {
    setItems((current) => normalizeCover(current.filter((item) => item.id !== itemId)))
    setError('')
  }

  function setCover(itemId: string) {
    setItems((current) => {
      const selected = current.find((item) => item.id === itemId)
      if (!selected) return current
      return [
        { ...selected, isCover: true },
        ...current
          .filter((item) => item.id !== itemId)
          .map((item) => ({ ...item, isCover: false })),
      ]
    })
  }

  function moveImage(itemId: string, direction: -1 | 1) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === itemId)
      const targetIndex = index + direction
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(targetIndex, 0, item)
      return next
    })
  }

  function reorderDroppedItem(targetId: string) {
    if (!draggedItemId || draggedItemId === targetId) return
    setItems((current) => {
      const sourceIndex = current.findIndex((item) => item.id === draggedItemId)
      const targetIndex = current.findIndex((item) => item.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const next = [...current]
      const [item] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, item)
      return next
    })
    setDraggedItemId('')
  }

  function dropFiles(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDraggingFiles(false)
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files)
  }

  return <div className="product-modal-backdrop product-image-manager-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section ref={dialogRef} className="product-image-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="product-image-manager-title" aria-describedby="product-image-manager-description" onKeyDown={handleDialogKeyDown}>
      <header className="product-image-manager-header">
        <div><span className="eyebrow">รูปภาพสินค้า</span><h2 id="product-image-manager-title">จัดการรูปภาพสินค้า</h2><p id="product-image-manager-description">เพิ่ม เปลี่ยนภาพปก และจัดลำดับรูปของ {product.name}</p></div>
        <button className="product-image-manager-close" type="button" aria-label="ปิดหน้าต่าง" data-tooltip="ปิด" onClick={onClose}><IconX aria-hidden="true" size={20} /></button>
      </header>

      <div className="product-image-manager-body">
        <section className="product-image-manager-summary" aria-label="สรุปรูปภาพ">
          <div><span>สินค้า</span><strong>{product.name}</strong></div>
          <div><span>จำนวนรูป</span><strong>{items.length} / {PRODUCT_IMAGE_MAX_FILES} รูป</strong></div>
          <div><span>ภาพปก</span><strong>{coverItem ? coverItem.name : 'ยังไม่ได้เลือก'}</strong></div>
        </section>

        <section className="product-image-manager-upload" aria-labelledby="product-image-manager-upload-title" data-dragging={draggingFiles || undefined} onDragEnter={(event) => { event.preventDefault(); setDraggingFiles(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFiles(false) }} onDrop={dropFiles}>
          <div className="product-image-manager-upload-icon"><PhotoIcon /></div>
          <div><h3 id="product-image-manager-upload-title">เพิ่มรูปภาพสินค้า</h3><p>ลากรูปมาวาง หรือเลือกหลายรูปจากเครื่องได้</p><small>JPEG, PNG, WebP · ไม่เกิน 5 MB ต่อรูป · สูงสุด {PRODUCT_IMAGE_MAX_FILES} รูป</small></div>
          <button className="button secondary product-image-manager-upload-button" type="button" disabled={items.length >= PRODUCT_IMAGE_MAX_FILES} onClick={() => addInputRef.current?.click()}><IconUpload aria-hidden="true" size={17} />เลือกจากเครื่อง</button>
          <input ref={addInputRef} className="sr-only" tabIndex={-1} type="file" accept={PRODUCT_IMAGE_ALLOWED_MIME_TYPES.join(',')} multiple onChange={(event) => { addFiles(event.currentTarget.files ?? []); event.currentTarget.value = '' }} />
        </section>

        {error ? <div className="product-image-manager-error" role="alert">{error}</div> : null}

        <section className="product-image-manager-gallery" aria-labelledby="product-image-manager-gallery-title">
          <div className="product-image-manager-gallery-heading"><div><h3 id="product-image-manager-gallery-title">รูปภาพทั้งหมด</h3><p>ลากการ์ดเพื่อเรียง หรือใช้ปุ่มลูกศรเพื่อจัดลำดับด้วยแป้นพิมพ์</p></div><span>{items.length} รูป</span></div>
          {items.length ? <div className="product-image-manager-grid" role="list">
            {items.map((item, index) => <article className={`product-image-manager-card${item.isCover ? ' is-cover' : ''}`} role="listitem" key={item.id} draggable onDragStart={(event) => { setDraggedItemId(item.id); event.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => setDraggedItemId('')} onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={(event) => { if (event.dataTransfer.files.length) return; event.preventDefault(); reorderDroppedItem(item.id) }}>
              <div className="product-image-manager-preview">
                <Image src={item.previewUrl} alt={item.name} fill sizes="(max-width: 760px) 44vw, 220px" unoptimized />
                <span className="product-image-manager-order">{index + 1}</span>
                {item.isCover ? <span className="product-image-manager-cover-badge"><StarIcon />ภาพปก</span> : null}
              </div>
              <div className="product-image-manager-card-copy"><strong title={item.name}>{item.name}</strong><span>{item.source === 'saved' ? 'รูปที่บันทึกไว้' : item.source === 'replacement' ? 'รูปใหม่แทนรูปเดิม' : 'รูปใหม่'}</span></div>
              <div className="product-image-manager-card-actions">
                <button type="button" className="product-image-manager-icon-action" aria-label={`เลื่อน ${item.name} ไปทางซ้าย`} data-tooltip="เลื่อนไปซ้าย" disabled={index === 0} onClick={() => moveImage(item.id, -1)}><ArrowIcon direction="left" /></button>
                <button type="button" className="product-image-manager-icon-action" aria-label={`เลื่อน ${item.name} ไปทางขวา`} data-tooltip="เลื่อนไปขวา" disabled={index === items.length - 1} onClick={() => moveImage(item.id, 1)}><ArrowIcon direction="right" /></button>
                {!item.isCover ? <button type="button" className="product-image-manager-cover-action" onClick={() => setCover(item.id)}><StarIcon />ตั้งเป็นภาพปก</button> : <span className="product-image-manager-cover-current">ภาพปกปัจจุบัน</span>}
                <label className="product-image-manager-replace-action" tabIndex={0} role="button" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click() } }}>เปลี่ยนภาพ<input tabIndex={-1} type="file" accept={PRODUCT_IMAGE_ALLOWED_MIME_TYPES.join(',')} onChange={(event) => { replaceImage(item.id, event.currentTarget.files); event.currentTarget.value = '' }} /></label>
                <button type="button" className="product-image-manager-icon-action danger" aria-label={`นำ ${item.name} ออก`} data-tooltip="นำรูปออก" onClick={() => removeImage(item.id)}><IconTrash aria-hidden="true" size={17} /></button>
              </div>
            </article>)}
          </div> : <div className="product-image-manager-empty"><div><PhotoIcon /></div><h3>ยังไม่มีรูปภาพสินค้า</h3><p>ลากรูปมาวางในพื้นที่ด้านบน หรือกด “เลือกจากเครื่อง” เพื่อเริ่มเพิ่มรูป</p></div>}
        </section>

        <div className="product-image-manager-note" role="note"><span aria-hidden="true">i</span><p><strong>การเปลี่ยนแปลงยังไม่ถูกบันทึก</strong> เมื่อกดยกเลิก รูปที่เพิ่ม เปลี่ยน หรือนำออกจะไม่ถูกนำไปใช้</p></div>
      </div>

      <footer className="product-image-manager-footer"><button className="button secondary" type="button" onClick={onClose}>ยกเลิก</button><button className="button" type="button" disabled aria-describedby="product-image-manager-save-note">บันทึกการเปลี่ยนแปลง</button><span id="product-image-manager-save-note" className="sr-only">การบันทึกจริงยังไม่เปิดใช้งานในขั้นนี้</span></footer>
    </section>
  </div>
}
