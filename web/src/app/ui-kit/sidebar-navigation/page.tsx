import type { Metadata } from 'next'
import { SidebarNavigationPreview } from './sidebar-navigation-preview'

export const metadata: Metadata = {
  title: 'Sidebar Navigation UI Kit | AVENZAONE',
  description: 'Interactive grouped sidebar navigation mockup for AVENZAONE.',
}

export default function SidebarNavigationUiKitPage() {
  return (
    <main className="sidebar-kit-page">
      <header className="sidebar-kit-hero">
        <div>
          <span className="eyebrow">UI KIT · SIDEBAR NAVIGATION</span>
          <h1>หัวข้อหลักและเมนูรอง</h1>
          <p>ตัวอย่าง Sidebar แบบลำดับชั้น กดพับ–ขยายได้ และมองเห็นตำแหน่งปัจจุบันชัดเจน</p>
        </div>
        <span className="sidebar-kit-status">MOCKUP · ยังไม่ใช้กับระบบจริง</span>
      </header>

      <SidebarNavigationPreview />

      <section className="sidebar-kit-spec" aria-labelledby="sidebar-kit-spec-title">
        <div>
          <span className="eyebrow">COMPONENT SPEC</span>
          <h2 id="sidebar-kit-spec-title">มาตรฐานที่เสนอ</h2>
        </div>
        <dl>
          <div><dt>หัวข้อหลัก</dt><dd>กดได้ทั้งแถว พร้อมลูกศรบอกสถานะพับ–ขยาย</dd></div>
          <div><dt>เมนูรอง</dt><dd>เยื้อง 28 px และมีเส้นแนวตั้งแสดงความสัมพันธ์</dd></div>
          <div><dt>หน้าปัจจุบัน</dt><dd>ใช้พื้นหลัง สีข้อความ และแถบด้านซ้ายร่วมกัน</dd></div>
          <div><dt>พื้นที่สัมผัส</dt><dd>สูงไม่น้อยกว่า 44 px รองรับเมาส์ คีย์บอร์ด และหน้าจอสัมผัส</dd></div>
        </dl>
      </section>
    </main>
  )
}
