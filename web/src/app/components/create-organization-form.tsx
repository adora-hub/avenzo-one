'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export function CreateOrganizationForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [timezone, setTimezone] = useState('Asia/Bangkok')
  const [currency, setCurrency] = useState('THB')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('กรุณาเข้าสู่ระบบใหม่')

      const { error } = await supabase.from('organizations').insert({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        timezone,
        currency: currency.toUpperCase(),
        created_by: user.id,
      })
      if (error?.code === '42501') throw new Error('บัญชีนี้ไม่มีสิทธิ์สร้าง Organization')
      if (error) throw error
      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถสร้าง Organization ได้')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>ชื่อ Organization<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น AVENZO Bangkok" /></label>
      <label>Slug<input required pattern="[a-z0-9-]+" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="avenzo-bangkok" /></label>
      <label>Timezone<input required value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
      <label>Currency<input required maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value)} /></label>
      {message && <div className="error">{message}</div>}
      <button className="button" disabled={loading}>{loading ? 'กำลังสร้าง…' : 'สร้าง Organization'}</button>
      <button type="button" className="button secondary" onClick={() => router.push('/dashboard')}>ยกเลิก</button>
    </form>
  )
}
