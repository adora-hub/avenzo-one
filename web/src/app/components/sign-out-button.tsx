'use client'

import { createClient } from '@/lib/supabase/browser'

export function SignOutButton() {
  async function signOut() {
    await createClient().auth.signOut()
    window.location.assign('/')
  }

  return <button className="button secondary" onClick={signOut}>ออกจากระบบ</button>
}
