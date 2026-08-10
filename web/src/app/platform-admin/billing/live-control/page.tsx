import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BillingLiveApprovalControl } from '@/app/components/billing-live-approval-control'
import { BillingControlledLiveCheckoutPreview } from '@/app/components/billing-controlled-live-checkout-preview'
import { BillingLiveEligibilityContractTests } from '@/app/components/billing-live-eligibility-contract-tests'
import { BillingLiveExecutorDesign } from '@/app/components/billing-live-executor-design'
import { BillingLiveReleaseGate } from '@/app/components/billing-live-release-gate'
import { BillingLiveSafetyControl } from '@/app/components/billing-live-safety-control'
import { BillingLiveRolloutControl } from '@/app/components/billing-live-rollout-control'
import { BillingLiveShadowExecutor } from '@/app/components/billing-live-shadow-executor'
import { BillingLiveWebhookConnectivityEvidence } from '@/app/components/billing-live-webhook-connectivity-evidence'
import { LiveControlCardSearch } from '@/app/components/live-control-card-search'
import { SignOutButton } from '@/app/components/sign-out-button'
import { buildLiveWebhookConnectivityEvidence } from '@/lib/billing/live-webhook-connectivity-evidence'
import { inspectLiveSafetyEnvironment, type BillingLiveActivationEvent, type BillingLiveActivationRequest, type BillingLiveCheckoutDryRun, type BillingLiveRolloutEvent, type BillingLiveRolloutPolicy, type BillingLiveSafetyControl as LiveControl, type BillingLiveSafetyEvent, type BillingLiveShadowCommand, type BillingLiveTester, type BillingLiveWebhookInboxEvent } from '@/lib/billing/live-safety'
import { createClient } from '@/lib/supabase/server'

function dateTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}

function actionLabel(action: BillingLiveSafetyEvent['action']) {
  if (action === 'lock') return 'ล็อกรับเงินจริง'
  if (action === 'rollback') return 'ย้อนกลับฉุกเฉิน'
  return 'พร้อมทบทวนขั้นต่อไป'
}

function rolloutActionLabel(action: BillingLiveRolloutEvent['action']) {
  return {
    policy_update: 'แก้ไขขีดจำกัด',
    tester_allow: 'อนุญาตผู้ทดสอบ',
    tester_revoke: 'พักสิทธิ์ผู้ทดสอบ',
    preview_check: 'จำลองตรวจสอบ',
    rollback: 'ย้อนกลับฉุกเฉิน',
  }[action]
}

function approvalActionLabel(action: BillingLiveActivationEvent['action']) {
  return {
    request: 'ส่งคำขออนุมัติ',
    approve: 'อนุมัติโดยคนที่ 2',
    reject: 'ไม่อนุมัติ',
    cancel: 'ยกเลิกคำขอ',
    expire: 'คำขอหมดอายุ',
  }[action]
}

export default async function BillingLiveControlPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/?next=/platform-admin/billing/live-control')

  const [adminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (adminResult.data?.status !== 'active') redirect('/dashboard')
  if (assuranceResult.data?.currentLevel !== 'aal2') redirect('/auth/mfa?next=/platform-admin/billing/live-control')

  const [controlResult, eventsResult, readinessResult, liveWebhookResult, policyResult, testersResult, rolloutEventsResult, approvalRequestsResult, approvalEventsResult, adminCountResult, dryRunsResult, shadowCommandsResult] = await Promise.all([
    supabase.from('billing_live_safety_controls').select('provider, state, emergency_stop, reason, version, updated_by_email, updated_at').eq('provider', 'stripe').maybeSingle(),
    supabase.from('billing_live_safety_events').select('id, action, previous_state, next_state, reason, actor_email, created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('billing_production_readiness_reviews').select('manual_status').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('billing_live_webhook_inbox').select('id, provider_event_id, event_type, environment, payload_sha256, livemode, processing_status, provider_created_at, received_at').order('received_at', { ascending: false }).limit(10),
    supabase.from('billing_live_rollout_policies').select('provider, pilot_enabled, max_amount_per_charge, max_total_amount, max_successful_charges, reason, version, updated_by_email, updated_at').eq('provider', 'stripe').maybeSingle(),
    supabase.from('billing_live_testers').select('id, email, active, reason, updated_by_email, updated_at').order('active', { ascending: false }).order('updated_at', { ascending: false }).limit(50),
    supabase.from('billing_live_rollout_events').select('id, action, tester_email, requested_amount, allowed, reason, actor_email, created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('billing_live_activation_requests').select('id, provider, status, policy_version, max_amount_per_charge, max_total_amount, max_successful_charges, tester_count, request_reason, requested_by, requested_by_email, requested_at, expires_at, reviewed_by, reviewed_by_email, review_reason, reviewed_at').order('requested_at', { ascending: false }).limit(10),
    supabase.from('billing_live_activation_events').select('id, request_id, action, reason, actor_email, created_at').order('created_at', { ascending: false }).limit(10),
    supabase.rpc('platform_admin_directory'),
    supabase.from('billing_live_checkout_dry_runs').select('id, command_id, provider, environment, tester_email, requested_amount, reference, eligible, real_charge, checks, policy_version, approval_request_id, actor_email, created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('billing_live_shadow_commands').select('id, command_id, source_dry_run_id, provider, executor_mode, status, idempotency_key, tester_email, requested_amount, reference, reason, policy_version, approval_request_id, checks, stage_snapshot, real_charge, stripe_api_called, checkout_session_id, actor_email, created_at').order('created_at', { ascending: false }).limit(10),
  ])
  const firstError = [controlResult, eventsResult, readinessResult, liveWebhookResult, policyResult, testersResult, rolloutEventsResult, approvalRequestsResult, approvalEventsResult, adminCountResult, dryRunsResult, shadowCommandsResult].find((result) => result.error)?.error
  const control = controlResult.data as LiveControl | null
  const events = (eventsResult.data ?? []) as BillingLiveSafetyEvent[]
  const environment = inspectLiveSafetyEnvironment()
  const liveWebhookEvents = (liveWebhookResult.data ?? []) as BillingLiveWebhookInboxEvent[]
  const rolloutPolicy = policyResult.data as BillingLiveRolloutPolicy | null
  const testers = (testersResult.data ?? []) as BillingLiveTester[]
  const rolloutEvents = (rolloutEventsResult.data ?? []) as BillingLiveRolloutEvent[]
  const approvalRequests = (approvalRequestsResult.data ?? []) as BillingLiveActivationRequest[]
  const approvalEvents = (approvalEventsResult.data ?? []) as BillingLiveActivationEvent[]
  const dryRuns = (dryRunsResult.data ?? []) as BillingLiveCheckoutDryRun[]
  const shadowCommands = (shadowCommandsResult.data ?? []) as BillingLiveShadowCommand[]
  const activeAdminCount = (adminCountResult.data ?? []).filter((admin: { status: string }) => admin.status === 'active').length
  const latestApprovedRequest = approvalRequests.find((request) => request.status === 'approved') ?? null
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const liveWebhookUrl = `${appUrl.replace(/\/$/, '')}/api/billing/stripe/live-webhook`
  const liveWebhookEvidence = buildLiveWebhookConnectivityEvidence({
    endpointUrl: liveWebhookUrl,
    liveSecretConfigured: environment.liveSecretConfigured,
    liveWebhookConfigured: environment.liveWebhookConfigured,
    emergencyStopActive: control?.emergency_stop === true,
    liveWebhookMode: environment.liveWebhookMode,
    acceptsRealMoney: environment.acceptsRealMoney,
    latestEvent: liveWebhookEvents[0] ?? null,
  })
  const canMarkReviewReady = readinessResult.data?.manual_status === 'manual_complete'
  const locks = [
    { label: 'Environment Lock', passed: environment.environmentLocked, detail: environment.environmentLocked ? 'STRIPE_LIVE_ACTIVATION ยังปิดอยู่' : 'พบการเปิด Environment Live ให้หยุดระบบทันที' },
    { label: 'Database Emergency Stop', passed: control?.emergency_stop === true, detail: control?.emergency_stop ? 'ฐานข้อมูลบังคับหยุดรับเงินจริง' : 'ไม่พบสถานะ Emergency Stop' },
    { label: 'Checkout Code Lock', passed: environment.codeTestOnly && environment.testSecretConfigured, detail: environment.testSecretConfigured ? 'Checkout เดิมยังรับเฉพาะ Stripe Test Key' : 'ยังไม่พบ Test Secret ที่ถูกต้อง ให้หยุดตรวจสอบ' },
    { label: 'Real-money Checkout', passed: !environment.acceptsRealMoney, detail: 'ยังไม่มี Route สำหรับสร้างรายการเงินจริง' },
  ]
  const allLocked = locks.every((item) => item.passed)

  return <main className="dashboard">
    <header className="topbar"><div className="brand">AVENZO ONE / ศูนย์ควบคุมการรับเงินจริง</div><div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div></header>
    <section className="content platform-subscription-content">
      <div className="hero"><div><div className="eyebrow">Phase 1.1.3.7.5.7</div><h1>ศูนย์ควบคุมการรับเงินจริง</h1><p>ตรวจหลักฐานการเชื่อมต่อ Stripe Live Webhook โดยยังไม่สร้าง Checkout ไม่เปลี่ยน Invoice/Subscription และไม่รับเงินจริง</p></div><div className="button-row"><Link className="button secondary" href="/platform-admin/billing/readiness">กลับความพร้อม Production</Link><Link className="button secondary" href="/platform-admin/billing">กลับ Billing</Link></div></div>
      <div className={`readiness-decision ${allLocked ? 'ready' : 'blocked'}`} role="status"><span aria-hidden="true">{allLocked ? '✓' : '!'}</span><div><strong>{allLocked ? 'ระบบถูกล็อกอย่างปลอดภัย' : 'พบจุดที่ไม่อยู่ในสถานะล็อก'}</strong><p>{allLocked ? 'ทุกชั้นป้องกันยังปิดการรับเงินจริง สามารถทดสอบคำสั่ง Emergency Stop ได้' : 'หยุดการเตรียม Live และแก้รายการที่ไม่ผ่านก่อน'}</p></div><span className="status pending">ไม่รับเงินจริง</span></div>
      <LiveControlCardSearch>
      {firstError || !control ? <div className="error">ไม่สามารถอ่านศูนย์ควบคุมการรับเงินจริงได้: {firstError?.message ?? 'ไม่พบข้อมูล Safety Control'}</div> : <>
        <section className="readiness-review-card">
          <div className="feature-list-heading"><div><div className="eyebrow">กุญแจความปลอดภัย 4 ชั้น</div><h2>สถานะบังคับหยุดรับเงินจริง</h2><p>ระบบแสดงเฉพาะชนิดและสถานะของ Secret โดยไม่แสดงค่าจริง</p></div><span className="feature-count">{locks.filter((item) => item.passed).length} / {locks.length} ชั้น</span></div>
          <div className="readiness-check-grid">{locks.map((lock) => <article className={`readiness-check ${lock.passed ? 'passed' : 'failed'}`} key={lock.label}><span aria-hidden="true">{lock.passed ? '✓' : '!'}</span><div><strong>{lock.label}</strong><p>{lock.detail}</p></div></article>)}</div>
          <dl className="live-safety-state-grid"><div><dt>สถานะฐานข้อมูล</dt><dd>{control.state === 'locked' ? 'ล็อกรับเงินจริง' : 'พร้อมทบทวน โดยยังล็อกอยู่'}</dd></div><div><dt>Emergency Stop</dt><dd>{control.emergency_stop ? 'ทำงานอยู่' : 'ไม่ทำงาน'}</dd></div><div><dt>เวอร์ชันคำสั่ง</dt><dd>{control.version}</dd></div><div><dt>ผู้บันทึกล่าสุด</dt><dd>{control.updated_by_email ?? 'ระบบเริ่มต้น'}</dd></div></dl>
        </section>
        <section className="readiness-review-card">
          <div className="feature-list-heading"><div><div className="eyebrow">Credentials แยกตามสภาพแวดล้อม</div><h2>สถานะ Secret ฝั่ง Server</h2><p>แสดงเฉพาะว่าตั้งค่าหรือยัง ระบบไม่ส่งค่าจริงมาที่ Browser</p></div><span className="feature-count">Test / Live</span></div>
          <div className="live-credential-grid">
            <article className={environment.testSecretConfigured ? 'configured' : 'missing'}><span>Test API Secret</span><strong>{environment.testSecretConfigured ? 'ตั้งค่าแล้ว' : 'ยังไม่ตั้งค่า'}</strong><small>STRIPE_SECRET_KEY · ต้องขึ้นต้น sk_test_</small></article>
            <article className={environment.testWebhookConfigured ? 'configured' : 'missing'}><span>Test Webhook Secret</span><strong>{environment.testWebhookConfigured ? 'ตั้งค่าแล้ว' : 'ยังไม่ตั้งค่า'}</strong><small>STRIPE_WEBHOOK_SECRET · คนละค่ากับ Live</small></article>
            <article className={environment.liveSecretConfigured ? 'configured' : 'missing'}><span>Live API Secret</span><strong>{environment.liveSecretConfigured ? 'ตั้งค่าแล้ว แต่ยังถูกล็อก' : 'ยังไม่ตั้งค่า (ยังปลอดภัย)'}</strong><small>STRIPE_LIVE_SECRET_KEY · Server-only</small></article>
            <article className={environment.liveWebhookConfigured ? 'configured' : 'missing'}><span>Live Webhook Secret</span><strong>{environment.liveWebhookConfigured ? 'ตั้งค่าแล้ว แต่ประมวลผลไม่ได้' : 'ยังไม่ตั้งค่า (ยังปลอดภัย)'}</strong><small>STRIPE_LIVE_WEBHOOK_SECRET · Server-only</small></article>
          </div>
          <div className="live-webhook-endpoint"><span>Live Webhook Endpoint</span><code>{liveWebhookUrl}</code><small>Endpoint นี้ตรวจลายเซ็นและกัก Event เท่านั้น ไม่เปลี่ยน Invoice หรือ Subscription</small></div>
        </section>
        <BillingLiveSafetyControl currentState={control.state} canMarkReviewReady={canMarkReviewReady} />
        {rolloutPolicy ? <BillingLiveRolloutControl policy={rolloutPolicy} testers={testers} /> : <div className="error">ไม่พบขีดจำกัดการทดลองรับเงินจริง</div>}
        <BillingLiveApprovalControl
          currentUserId={user.id}
          requests={approvalRequests}
          serverNow={new Date().toISOString()}
          productionReadinessComplete={canMarkReviewReady}
          reviewReady={control.state === 'review_ready'}
          activeTesterCount={testers.filter((tester) => tester.active).length}
          activeAdminCount={activeAdminCount}
          events={approvalEvents}
          pilotEnabled={rolloutPolicy?.pilot_enabled ?? false}
          emergencyStop={control.emergency_stop}
        />
        {rolloutPolicy ? <BillingControlledLiveCheckoutPreview
          control={control}
          policy={rolloutPolicy}
          testers={testers}
          latestApprovedRequest={latestApprovedRequest}
          productionReadinessComplete={canMarkReviewReady}
          environmentLocked={environment.environmentLocked}
          liveCredentialsConfigured={environment.liveSecretConfigured && environment.liveWebhookConfigured}
          serverNow={new Date().toISOString()}
          dryRuns={dryRuns}
        /> : null}
        <BillingLiveEligibilityContractTests />
        <BillingLiveReleaseGate />
        <BillingLiveExecutorDesign />
        <BillingLiveShadowExecutor dryRuns={dryRuns} initialCommands={shadowCommands} />
        <BillingLiveWebhookConnectivityEvidence evidence={liveWebhookEvidence} />
        <section className="readiness-review-card">
          <div className="feature-list-heading"><div><div className="eyebrow">Two-person Approval Audit</div><h2>ประวัติการอนุมัติร่วมกัน</h2><p>แสดง 10 เหตุการณ์ล่าสุด ผู้ขอและผู้อนุมัติไม่สามารถเป็นบัญชีเดียวกัน</p></div><span className="feature-count">{approvalEvents.length} รายการ</span></div>
          {approvalEvents.length ? <div className="live-safety-events">{approvalEvents.map((event) => <article key={event.id}><div><strong>{approvalActionLabel(event.action)}</strong><span>{event.actor_email} · {dateTime(event.created_at)}</span></div><p>{event.reason}</p></article>)}</div> : <div className="empty-state">ยังไม่มีคำขอหรือผลอนุมัติ Limited Live Pilot</div>}
        </section>
        <section className="readiness-review-card">
          <div className="feature-list-heading"><div><div className="eyebrow">Pilot Audit Log</div><h2>ประวัติกติกาและผู้ทดสอบ</h2><p>แสดง 10 รายการล่าสุด รวมการจำลองตรวจสอบและการย้อนกลับ</p></div><span className="feature-count">{rolloutEvents.length} รายการ</span></div>
          {rolloutEvents.length ? <div className="live-safety-events">{rolloutEvents.map((event) => <article key={event.id}><div><strong>{rolloutActionLabel(event.action)}</strong><span>{event.actor_email} · {dateTime(event.created_at)}</span></div><div><p>{event.reason}</p>{event.tester_email ? <span>{event.tester_email}{event.requested_amount ? ` · ฿${Number(event.requested_amount).toLocaleString('th-TH')}` : ''}</span> : null}</div></article>)}</div> : <div className="empty-state">ยังไม่มีคำสั่งเกี่ยวกับ Pilot</div>}
        </section>
        <section className="readiness-review-card">
          <div className="feature-list-heading"><div><div className="eyebrow">Live Webhook Quarantine</div><h2>Event ที่ถูกกักไว้</h2><p>เก็บเฉพาะ Event ID, Type, เวลา และ Hash ไม่เก็บ Raw Payload หรือข้อมูลลูกค้า</p></div><span className="feature-count">{liveWebhookEvents.length} รายการล่าสุด</span></div>
          {liveWebhookEvents.length ? <div className="live-webhook-events">{liveWebhookEvents.map((event) => <article key={event.id}><div><strong>{event.event_type}</strong><span>{event.provider_event_id}</span></div><div><strong>ถูกหยุดโดย Emergency Stop</strong><span>รับเมื่อ {dateTime(event.received_at)}</span></div></article>)}</div> : <div className="empty-state">ยังไม่มี Live Event ที่ผ่านการตรวจลายเซ็นและถูกกักไว้</div>}
        </section>
        <section className="readiness-review-card">
          <div className="feature-list-heading"><div><div className="eyebrow">Audit Log</div><h2>ประวัติคำสั่งความปลอดภัย</h2><p>แสดง 10 รายการล่าสุดและไม่สามารถแก้ไขย้อนหลัง</p></div><span className="feature-count">{events.length} รายการ</span></div>
          {events.length ? <div className="live-safety-events">{events.map((event) => <article key={event.id}><div><strong>{actionLabel(event.action)}</strong><span>{event.actor_email} · {dateTime(event.created_at)}</span></div><p>{event.reason}</p></article>)}</div> : <div className="empty-state">ยังไม่มีคำสั่งจากผู้ดูแล ระบบเริ่มต้นอยู่ในสถานะล็อก</div>}
        </section>
      </>}
      </LiveControlCardSearch>
      <div className="readiness-safety-note"><strong>ข้อจำกัดของ Phase 1.1.3.7.5.7</strong><p>ระบบอ่านและแสดงหลักฐาน Webhook เท่านั้น ยังคงบังคับ Pilot = ปิด, Emergency Stop = เปิด ไม่สร้าง Checkout ไม่เปลี่ยน Invoice/Subscription และไม่มีเงินจริงเคลื่อนย้าย</p></div>
    </section>
  </main>
}
