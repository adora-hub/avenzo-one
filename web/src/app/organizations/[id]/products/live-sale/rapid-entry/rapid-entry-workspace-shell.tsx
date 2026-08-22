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

function ArrowDownIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
}

function ArrowUpIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
}

function LightningIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" /></svg>
}

function MonitorIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
}

export function RapidEntryWorkspaceShell({ organizationId, organizationName, actorUserId, canManage, activeReservation, assignedSalesCodes, categories }: Props) {
  const productsHref = `/organizations/${organizationId}/products`

  return <>
    <div id="rapidPageTop" className="live-sale-rapid-supported">
      <header className="live-sale-page-heading live-sale-rapid-heading">
        <div className="live-sale-heading-copy">
          <div className="live-sale-title-line">
            <span className="live-sale-rapid-title-icon"><LightningIcon /></span>
            <h1>สร้างสินค้าด่วน</h1>
            <span className="live-sale-preview-badge">สูงสุด 50 รายการ</span>
          </div>
          <p>เตรียมข้อมูล ตรวจสอบ และสร้างสินค้าหลายรายการในครั้งเดียวสำหรับ {organizationName}</p>
        </div>
        <div className="live-sale-heading-actions">
          <Link className="button secondary" href={productsHref}><ArrowLeftIcon />กลับหน้าสินค้า</Link>
          {canManage ? <a className="button secondary" href="#rapidValidationTitle"><ArrowDownIcon />ไปส่วนตรวจสอบ</a> : null}
        </div>
      </header>

      {!canManage && <p className="live-sale-permission-note" role="status">บัญชีนี้ดูโครงหน้าจอได้ แต่ไม่มีสิทธิ์สร้างสินค้า เมื่อต่อระบบจริง Action สำหรับสร้างรายการจะถูกปิดไว้</p>}

      <section className="live-sale-rapid-workspace" aria-labelledby="rapidWorkspaceTitle">
        <header className="live-sale-rapid-workspace-header">
          <div>
            <span className="live-sale-rapid-kicker">รองรับคอมพิวเตอร์และ Tablet แนวนอน</span>
            <h2 id="rapidWorkspaceTitle">พื้นที่เตรียมสินค้าขายด่วน</h2>
            <p>หน้าจอขั้นต่ำ 1,024px · สูงสุด 50 รายการต่อหนึ่งชุด</p>
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
      <a className="product-back-to-top live-sale-rapid-back-to-top" href="#rapidPageTop" aria-label="กลับด้านบน" title="กลับด้านบน"><ArrowUpIcon /></a>
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
