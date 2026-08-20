import { PasswordRecoveryForm } from '../../components/password-recovery-form'

export default function SetPasswordPage() {
  return (
    <main className="shell">
      <section className="auth-card">
        <div className="eyebrow">AVENZO ONE</div>
        <h1>ตั้งรหัสผ่านใหม่</h1>
        <p>เปิดลิงก์จากอีเมลเพื่อกำหนดรหัสผ่านใหม่อย่างปลอดภัย</p>
        <PasswordRecoveryForm />
      </section>
    </main>
  )
}
