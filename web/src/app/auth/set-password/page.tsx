import { redirect } from 'next/navigation'
import { SetPasswordForm } from '../../components/set-password-form'
import { createClient } from '@/lib/supabase/server'

export default async function SetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/?next=/auth/set-password')
  }

  return (
    <main className="shell">
      <section className="auth-card">
        <div className="eyebrow">AVENZO ONE</div>
        <h1>ตั้งรหัสผ่านใหม่</h1>
        <p>กำหนดรหัสผ่านอย่างน้อย 8 ตัวอักษรสำหรับ {user.email}</p>
        <SetPasswordForm />
      </section>
    </main>
  )
}
