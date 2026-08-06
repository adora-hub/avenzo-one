'use client'

import { createClient } from '@/lib/supabase/browser'

export function SignOutButton({
  redirectTo = '/',
  label = 'ออกจากระบบ',
}: {
  redirectTo?: string
  label?: string
} = {}) {
  async function signOut() {
    await createClient().auth.signOut()
    window.location.assign(redirectTo)
  }

  return <button className="button secondary" onClick={signOut}>{label}</button>
}
