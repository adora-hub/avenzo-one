import { AuthForm } from './components/auth-form'
import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="shell">
      <section className="auth-card">
        <div className="eyebrow">AVENZO ONE</div>
        <h1>เข้าสู่ระบบ</h1>
        <p>พื้นที่ทำงานสำหรับองค์กร ร้านค้า สาขา และการจัดการ Subscription</p>
        <AuthForm />
        <nav className="auth-legal" aria-label="ข้อมูลทางกฎหมาย">
          <Link href="/privacy">ความเป็นส่วนตัว</Link>
          <span aria-hidden="true">•</span>
          <Link href="/terms">ข้อกำหนดการใช้งาน</Link>
        </nav>
      </section>
    </main>
  )
}
