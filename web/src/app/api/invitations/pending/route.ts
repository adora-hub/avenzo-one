import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ invitationId: null }, { status: 401 })

  const { data, error } = await supabase
    .from('organization_invitations')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invitationId: data?.id ?? null })
}
