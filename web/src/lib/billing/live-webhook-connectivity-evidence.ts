export type LiveWebhookEvidenceEvent = {
  provider_event_id: string
  event_type: string
  environment: string
  payload_sha256: string
  livemode: boolean
  processing_status: string
  provider_created_at: string
  received_at: string
}

export type LiveWebhookEvidenceCheck = {
  key: 'public_endpoint' | 'server_credentials' | 'emergency_stop' | 'signed_live_event' | 'quarantine' | 'no_business_mutation'
  label: string
  passed: boolean
  detail: string
}

export type LiveWebhookConnectivityEvidence = {
  phase: '1.1.3.7.5.7'
  status: 'blocked' | 'waiting_for_live_event' | 'verified'
  passed: boolean
  passedCount: number
  checks: LiveWebhookEvidenceCheck[]
  latestEvent: LiveWebhookEvidenceEvent | null
  realMoneyAllowed: false
}

type BuildEvidenceInput = {
  endpointUrl: string
  liveSecretConfigured: boolean
  liveWebhookConfigured: boolean
  emergencyStopActive: boolean
  liveWebhookMode: 'verify_and_quarantine'
  acceptsRealMoney: false
  latestEvent: LiveWebhookEvidenceEvent | null
}

function isPublicHttpsEndpoint(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1'
  } catch {
    return false
  }
}

function isSignedLiveEventEvidence(event: LiveWebhookEvidenceEvent | null) {
  return Boolean(
    event
    && event.provider_event_id.startsWith('evt_')
    && event.event_type.length >= 3
    && event.environment === 'production'
    && event.livemode === true
    && /^[0-9a-f]{64}$/.test(event.payload_sha256),
  )
}

export function buildLiveWebhookConnectivityEvidence(input: BuildEvidenceInput): LiveWebhookConnectivityEvidence {
  const publicEndpoint = isPublicHttpsEndpoint(input.endpointUrl)
  const signedLiveEvent = isSignedLiveEventEvidence(input.latestEvent)
  const checks: LiveWebhookEvidenceCheck[] = [
    {
      key: 'public_endpoint',
      label: 'ปลายทาง Production เป็น HTTPS',
      passed: publicEndpoint,
      detail: publicEndpoint ? 'Stripe เข้าถึงปลายทางสาธารณะได้' : 'ต้องใช้ URL สาธารณะ HTTPS ที่ไม่ใช่ localhost',
    },
    {
      key: 'server_credentials',
      label: 'กุญแจ Live อยู่ฝั่ง Server ครบ',
      passed: input.liveSecretConfigured && input.liveWebhookConfigured,
      detail: input.liveSecretConfigured && input.liveWebhookConfigured ? 'ตั้งค่า Live API Secret และ Live Webhook Secret แล้ว' : 'ยังตั้งค่า Live Secret ไม่ครบ',
    },
    {
      key: 'emergency_stop',
      label: 'Emergency Stop ทำงานอยู่',
      passed: input.emergencyStopActive,
      detail: input.emergencyStopActive ? 'Event ที่รับเข้ามาไม่สามารถเดินหน้ารับเงินจริง' : 'ต้องเปิด Emergency Stop ก่อนตรวจหลักฐาน',
    },
    {
      key: 'signed_live_event',
      label: 'พบ Live Event ที่ผ่านลายเซ็น',
      passed: signedLiveEvent,
      detail: signedLiveEvent ? `ยืนยันจาก Event ID ${input.latestEvent?.provider_event_id}` : 'ยังไม่มี Live Event จริงที่ผ่านการตรวจลายเซ็น',
    },
    {
      key: 'quarantine',
      label: 'Event ถูกกักอย่างปลอดภัย',
      passed: signedLiveEvent && input.latestEvent?.processing_status === 'blocked_by_emergency_stop',
      detail: signedLiveEvent && input.latestEvent?.processing_status === 'blocked_by_emergency_stop' ? 'สถานะ blocked_by_emergency_stop ถูกบันทึกแล้ว' : 'ยังไม่มีหลักฐานว่า Event ถูก Emergency Stop กักไว้',
    },
    {
      key: 'no_business_mutation',
      label: 'ไม่เปลี่ยน Invoice หรือ Subscription',
      passed: input.liveWebhookMode === 'verify_and_quarantine' && input.acceptsRealMoney === false,
      detail: 'Endpoint ทำงานแบบตรวจลายเซ็นและเก็บ Metadata เท่านั้น',
    },
  ]
  const foundationReady = checks.slice(0, 3).every((check) => check.passed) && checks[5].passed
  const verified = checks.every((check) => check.passed)

  return {
    phase: '1.1.3.7.5.7',
    status: verified ? 'verified' : foundationReady ? 'waiting_for_live_event' : 'blocked',
    passed: verified,
    passedCount: checks.filter((check) => check.passed).length,
    checks,
    latestEvent: input.latestEvent,
    realMoneyAllowed: false,
  }
}
