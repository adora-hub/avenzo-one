import { AuthForm } from './components/auth-form'

export default function HomePage() {
  return (
    <main className="shell">
      <section className="auth-card">
        <div className="eyebrow">AVENZO ONE</div>
        <h1>เข้าสู่ระบบ</h1>
        <p>พื้นที่ทำงานสำหรับองค์กร ร้านค้า สาขา และการจัดการ Subscription</p>
        <AuthForm />
      </section>
    </main>
  )
}
