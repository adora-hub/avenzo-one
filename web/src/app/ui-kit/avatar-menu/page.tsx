import type { Metadata } from 'next'
import { AvatarMenuPreview } from './avatar-menu-preview'

export const metadata: Metadata = {
  title: 'Avatar Account Menu UI Kit | AVENZAONE',
  description: 'Interactive avatar and account dropdown mockup for AVENZAONE.',
}

export default function AvatarMenuUiKitPage() {
  return (
    <main className="avatar-kit-page">
      <header className="avatar-kit-hero">
        <span className="eyebrow">UI KIT · ACCOUNT MENU</span>
        <h1>Avatar และเมนูบัญชี</h1>
        <p>Mockup สำหรับทดลองรูปแบบ Avatar ตามตัวอย่าง โดยยังไม่เชื่อมกับข้อมูลจริงหรือเปลี่ยนเมนูหลักของระบบ</p>
      </header>

      <AvatarMenuPreview />

      <section className="avatar-kit-spec" aria-labelledby="avatar-kit-spec-title">
        <div>
          <span className="eyebrow">COMPONENT SPEC</span>
          <h2 id="avatar-kit-spec-title">มาตรฐานที่เสนอ</h2>
        </div>
        <dl>
          <div><dt>Avatar</dt><dd>32 px บนปุ่ม · 40 px ในเมนู</dd></div>
          <div><dt>ปุ่มเปิด</dt><dd>สูงอย่างน้อย 44 px รองรับการสัมผัส</dd></div>
          <div><dt>เมนู</dt><dd>กว้าง 300 px · มือถือไม่เกินขอบจอ</dd></div>
          <div><dt>การเข้าถึง</dt><dd>Tab, Enter, Escape และ Focus Ring</dd></div>
        </dl>
      </section>
    </main>
  )
}
