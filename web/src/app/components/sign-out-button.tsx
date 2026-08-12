'use client'

import { createClient } from '@/lib/supabase/browser'

export function SignOutButton({
  redirectTo = '/',
  label = 'ออกจากระบบ',
  className = 'button secondary',
  showIcon = false,
}: {
  redirectTo?: string
  label?: string
  className?: string
  showIcon?: boolean
} = {}) {
  async function signOut() {
    await createClient().auth.signOut()
    window.location.assign(redirectTo)
  }

  return (
    <button className={className} type="button" onClick={signOut}>
      {showIcon && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4m4-4H9" /></svg>}
      <span>{label}</span>
    </button>
  )
}
