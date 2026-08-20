import Link from 'next/link'
import { RapidEntrySetupWorkspace } from './rapid-entry-setup-workspace'

type Props = {
  organizationId: string
  organizationName: string
  canManage: boolean
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

export function RapidEntryWorkspaceShell({ organizationId, organizationName, canManage }: Props) {
  const productsHref = `/organizations/${organizationId}/products`
  const liveSaleHref = `${productsHref}/live-sale`

  return <>
    <div className="live-sale-rapid-supported">
      <header className="live-sale-page-heading live-sale-rapid-heading">
        <div className="live-sale-heading-copy">
          <span className="live-sale-eyebrow">LIVE SALE · RAPID ENTRY</span>
          <div className="live-sale-title-line">
            <h1>กรอกสินค้าแบบตาราง</h1>
            <span className="live-sale-preview-badge">UI PREVIEW</span>
          </div>
          <p>เตรียมสินค้าและรหัสขายได้สูงสุด 50 รายการในพื้นที่เดียวสำหรับ {organizationName}</p>
        </div>
        <div className="live-sale-heading-actions">
          <Link className="button secondary" href={liveSaleHref}><ArrowLeftIcon />กลับ Live Sale</Link>
          <button className="button" type="button" disabled>เริ่มตั้งค่าชุด 50 รหัส</button>
        </div>
      </header>

      <section className="live-sale-preview-notice" role="note">
        <TableIcon />
        <div>
          <strong>Rapid Entry · UI Preview เท่านั้น</strong>
          <span>การตรวจ Prefix เป็นข้อมูลจำลอง ไม่จองรหัส ไม่สร้าง Product/SKU ไม่อัปโหลดรูป และไม่เปลี่ยนแปลง Stock จริง</span>
        </div>
      </section>

      {!canManage && <p className="live-sale-permission-note" role="status">บัญชีนี้ดูโครงหน้าจอได้ แต่ไม่มีสิทธิ์สร้างสินค้า เมื่อต่อระบบจริง Action สำหรับสร้างรายการจะถูกปิดไว้</p>}

      <section className="live-sale-rapid-workspace" aria-labelledby="rapidWorkspaceTitle">
        <header className="live-sale-rapid-workspace-header">
          <div>
            <span className="live-sale-rapid-kicker">รองรับคอมพิวเตอร์และ Tablet แนวนอน</span>
            <h2 id="rapidWorkspaceTitle">พื้นที่เตรียมสินค้าขายด่วน</h2>
            <p>Viewport ขั้นต่ำ 1,024px · สูงสุด 50 แถวต่อหนึ่งชุด · UI Simulation</p>
          </div>
          <span className="live-sale-rapid-limit-badge">สูงสุด 50 รายการ</span>
        </header>

        <ol className="live-sale-rapid-steps" aria-label="ขั้นตอนการเตรียมสินค้าแบบตาราง">
          <li className="is-complete"><span>1</span><div><strong>ตรวจและจองรหัส</strong><small>UI Simulation พร้อมทดสอบ</small></div></li>
          <li className="is-complete"><span>2</span><div><strong>กำหนดชื่อสินค้า</strong><small>Template และตัวอย่างชื่อ</small></div></li>
          <li className="is-current"><span>3</span><div><strong>กรอกข้อมูลในตาราง</strong><small>โครงสร้าง 50 แถวพร้อมตรวจ</small></div></li>
          <li><span>4</span><div><strong>ตรวจสอบก่อนสร้าง</strong><small>สร้างครบทั้งชุดหรือไม่สร้างเลย</small></div></li>
        </ol>

        <div className="live-sale-rapid-stage-grid">
          <RapidEntrySetupWorkspace canManage={canManage} />
          <aside className="live-sale-rapid-scope-card" aria-label="ขอบเขต Rapid Entry รุ่นแรก">
            <h3>ขอบเขต V1</h3>
            <ul>
              <li>ใช้บนจอกว้างอย่างน้อย 1,024px</li>
              <li>ตรวจและแนะนำช่วงต่อเนื่อง 50 รหัส</li>
              <li>รองรับ Mouse และ Keyboard workflow</li>
              <li>ไม่มี Mobile Card fallback</li>
            </ul>
          </aside>
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
        <Link className="button" href={liveSaleHref}>กลับ Live Sale</Link>
        <Link className="button secondary" href={productsHref}>กลับหน้าสินค้า</Link>
      </div>
    </section>
  </>
}
