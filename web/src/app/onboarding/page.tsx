import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreateOrganizationForm } from '../components/create-organization-form'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return (
    <main className="shell">
      <section className="auth-card">
        <div className="eyebrow">Workspace Setup</div>
        <h1>สร้าง Organization</h1>
        <p>เริ่มต้นพื้นที่ทำงานขององค์กรหรือร้านค้าของคุณ</p>
        <CreateOrganizationForm />
      </section>
    </main>
  )
}
