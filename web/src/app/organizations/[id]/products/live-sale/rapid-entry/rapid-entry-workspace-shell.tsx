import Link from 'next/link'
import { RapidEntrySetupWorkspace } from './rapid-entry-setup-workspace'
import type { RapidRangeSelection } from './rapid-prefix-assistant'

type Props = {
  organizationId: string
  organizationName: string
  actorUserId: string
  canManage: boolean
  activeReservation: RapidRangeSelection | null
  assignedSalesCodes: string[]
  categories: Array<{ id: string; name: string }>
}

function ArrowLeftIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6M9 12h10" /></svg>
}

function TableIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11M15 9v11" /></svg>
}

function MonitorIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
}

export function RapidEntryWorkspaceShell({ organizationId, organizationName, actorUserId, canManage, activeReservation, assignedSalesCodes, categories }: Props) {
  const productsHref = `/organizations/${organizationId}/products`

  return <>
    <div className="live-sale-rapid-supported">
      <header className="live-sale-page-heading live-sale-rapid-heading">
        <div className="live-sale-heading-copy">
          <span className="live-sale-eyebrow">LIVE SALE · RAPID ENTRY</span>
          <div className="live-sale-title-line">
            <h1>กรอกสินค้าแบบตาราง</h1>
            <span className="live-sale-preview-badge">LOCAL BACKEND</span>
          </div>
          <p>เตรียมสินค้าและรหัสขายได้สูงสุด 50 รายการในพื้นที่เดียวสำหรับ {organizationName}</p>
        </div>
        <div className="live-sale-heading-actions">
          <Link className="button secondary" href={productsHref}><ArrowLeftIcon />กลับหน้าสินค้า</Link>
          {canManage ? <a className="button" href="#rapidValidationTitle">ไปตรวจสอบก่อนสร้าง</a> : null}
        </div>
      </header>

      <section className="live-sale-preview-notice" role="note">
        <TableIcon />
        <div>
          <strong>Rapid Entry · เชื่อม Local Backend แล้ว</strong>
          <span>ระบบสร้าง Product/SKU แบบทั้งชุด อัปโหลดรูปผ่าน Private Storage และรับสต็อกผ่าน Atomic Batch; PREVIEW และ Production ยังไม่ถูกแก้ไข</span>
        </div>
      </section>

      {!canManage && <p className="live-sale-permission-note" role="status">บัญชีนี้ดูโครงหน้าจอได้ แต่ไม่มีสิทธิ์สร้างสินค้า เมื่อต่อระบบจริง Action สำหรับสร้างรายการจะถูกปิดไว้</p>}

      <section className="live-sale-rapid-workspace" aria-labelledby="rapidWorkspaceTitle">
        <header className="live-sale-rapid-workspace-header">
          <div>
            <span className="live-sale-rapid-kicker">รองรับคอมพิวเตอร์และ Tablet แนวนอน</span>
            <h2 id="rapidWorkspaceTitle">พื้นที่เตรียมสินค้าขายด่วน</h2>
            <p>Viewport ขั้นต่ำ 1,024px · สูงสุด 50 แถวต่อหนึ่งชุด · Local Backend</p>
          </div>
          <span className="live-sale-rapid-limit-badge">สูงสุด 50 รายการ</span>
        </header>

        <ol className="live-sale-rapid-steps" aria-label="ขั้นตอนการเตรียมสินค้าแบบตาราง">
          <li className="is-complete"><span>1</span><div><strong>ตรวจและจองรหัส</strong><small>จองช่วงจริง 3 ชั่วโมง</small></div></li>
          <li className="is-complete"><span>2</span><div><strong>กำหนดชื่อสินค้า</strong><small>เลือกรูปแบบชื่อและรหัสขาย</small></div></li>
          <li className="is-current"><span>3</span><div><strong>กรอกข้อมูลในตาราง</strong><small>โครงสร้าง 50 แถวพร้อมตรวจ</small></div></li>
          <li><span>4</span><div><strong>ตรวจสอบก่อนสร้าง</strong><small>สร้างครบทั้งชุดหรือไม่สร้างเลย</small></div></li>
        </ol>

        <div className="live-sale-rapid-stage-grid">
          <RapidEntrySetupWorkspace organizationId={organizationId} actorUserId={actorUserId} canManage={canManage} activeReservation={activeReservation} assignedSalesCodes={assignedSalesCodes} categories={categories} />
        </div>
      </section>
    </div>

    <section className="live-sale-rapid-viewport-block" role="status" aria-labelledby="rapidViewportTitle">
      <span className="live-sale-rapid-block-icon"><MonitorIcon /></span>
      <div>
        <span className="live-sale-eyebrow">LIVE SALE · RAPID ENTRY</span>
        <h1 id="rapidViewportTitle">กรุณาเปิดด้วยหน้าจอที่กว้างขึ้น</h1>
        <p>โหมดกรอกสินค้าแบบตารางรองรับคอมพิวเตอร์หรือ Tablet แนวนอนที่มีความกว้างอย่างน้อย 1,024px เพื่อให้กรอกข้อมูลได้ครบและลดความผิดพลาด</p>
      </div>
      <div className="live-sale-rapid-block-actions">
        <Link className="button secondary" href={productsHref}>กลับหน้าสินค้า</Link>
      </div>
    </section>
  </>
}
