import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })

  const body = await request.json() as { organizationId?: string; email?: string; roleCode?: string; branchId?: string | null }
  const email = body.email?.trim().toLowerCase()
  if (!body.organizationId || !email || !body.roleCode) return NextResponse.json({ error: 'invalid_invitation_request' }, { status: 400 })

  const { data, error } = await supabase.rpc('create_organization_invitation', {
    p_organization_id: body.organizationId,
    p_email: email,
    p_role_code: body.roleCode,
    p_branch_id: body.branchId || null,
  })
  if (error) {
    if (error.code === '23505' || error.message.includes('organization_invitations_pending_email_unique')) {
      const { data: existing } = await supabase.from('organization_invitations').select('id').eq('organization_id', body.organizationId).eq('email', email).eq('status', 'pending').maybeSingle()
      if (existing) return NextResponse.json({ invitationId: existing.id, invitationUrl: `${new URL(request.url).origin}/invitations/${existing.id}`, delivery: 'manual_link', message: 'อีเมลนี้มีคำเชิญที่ยังรอการตอบรับอยู่แล้ว' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const invitation = Array.isArray(data) ? data[0] : data
  if (!invitation?.id) return NextResponse.json({ error: 'invitation_not_created' }, { status: 500 })

  const origin = new URL(request.url).origin
  const invitationUrl = `${origin}/invitations/${invitation.id}`
  const invitationSetupPath = `/invitations/${invitation.id}?setup=1`
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(invitationSetupPath)}`
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!secretKey) {
    return NextResponse.json({ invitationId: invitation.id, invitationUrl, delivery: 'manual_link', message: 'บันทึกคำเชิญแล้ว แต่ยังไม่ได้ตั้งค่าอีเมลอัตโนมัติ' }, { status: 202 })
  }

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
  if (inviteError) {
    const isExistingUser = /already|registered|exists/i.test(inviteError.message)
    return NextResponse.json({ invitationId: invitation.id, invitationUrl, delivery: 'manual_link', message: isExistingUser ? 'ผู้รับมีบัญชีแล้ว ใช้ลิงก์คำเชิญนี้ได้ทันที' : 'บันทึกคำเชิญแล้ว แต่ส่งอีเมลไม่สำเร็จ' }, { status: 202 })
  }

  return NextResponse.json({ invitationId: invitation.id, invitationUrl, delivery: 'email_sent', message: 'สร้างคำเชิญและส่งอีเมลแล้ว' })
}
