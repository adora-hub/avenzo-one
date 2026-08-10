import type { LiveWebhookConnectivityEvidence } from '@/lib/billing/live-webhook-connectivity-evidence'

function dateTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}

function statusCopy(status: LiveWebhookConnectivityEvidence['status']) {
  if (status === 'verified') return { title: 'พบหลักฐานการเชื่อมต่อแล้ว', detail: 'Stripe Live Event ผ่านลายเซ็นและถูก Emergency Stop กักไว้เรียบร้อย', badge: 'หลักฐานครบ' }
  if (status === 'waiting_for_live_event') return { title: 'ระบบพร้อม รอ Live Event แรก', detail: 'การตั้งค่าพื้นฐานครบแล้ว แต่ยังไม่ควรแสดงว่าผ่านจนกว่าจะพบ Event จริง', badge: 'รอหลักฐาน' }
  return { title: 'เงื่อนไขการเชื่อมต่อยังไม่พร้อม', detail: 'แก้รายการสีแดงให้ครบก่อนทดสอบ Live Event', badge: 'ยังไม่พร้อม' }
}

export function BillingLiveWebhookConnectivityEvidence({ evidence }: { evidence: LiveWebhookConnectivityEvidence }) {
  const copy = statusCopy(evidence.status)
  return <section className="readiness-review-card">
    <div className="feature-list-heading">
      <div><div className="eyebrow">Phase 1.1.3.7.5.7 · Live Webhook Evidence</div><h2>หลักฐานการเชื่อมต่อ Stripe Live Webhook</h2><p>ตรวจจากการตั้งค่าฝั่ง Server และ Metadata ของ Event จริง โดยไม่สร้าง Checkout และไม่รับเงินจริง</p></div>
      <span className={`feature-count ${evidence.status === 'verified' ? '' : 'has-warning'}`}>{evidence.passedCount} / {evidence.checks.length} ผ่าน</span>
    </div>
    <div className={`readiness-decision ${evidence.status === 'verified' ? 'ready' : 'blocked'}`} role="status">
      <span aria-hidden="true">{evidence.status === 'verified' ? '✓' : '!'}</span>
      <div><strong>{copy.title}</strong><p>{copy.detail}</p></div>
      <span className="status pending">{copy.badge}</span>
    </div>
    <div className="readiness-check-grid">
      {evidence.checks.map((check) => <article className={`readiness-check ${check.passed ? 'passed' : 'failed'}`} key={check.key}>
        <span aria-hidden="true">{check.passed ? '✓' : '!'}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div>
      </article>)}
    </div>
    {evidence.latestEvent ? <div className="live-webhook-endpoint">
      <span>หลักฐานล่าสุดที่จัดเก็บแบบไม่เก็บข้อมูลลูกค้า</span>
      <code>{evidence.latestEvent.event_type} · {evidence.latestEvent.provider_event_id}</code>
      <small>รับเมื่อ {dateTime(evidence.latestEvent.received_at)} · SHA-256 {evidence.latestEvent.payload_sha256.slice(0, 12)}…{evidence.latestEvent.payload_sha256.slice(-8)}</small>
    </div> : <div className="empty-state">ยังไม่มี Live Event ที่ผ่านลายเซ็น ระบบจึงยังไม่สรุปว่าการเชื่อมต่อสำเร็จ</div>}
    <div className="readiness-safety-note"><strong>ขอบเขตความปลอดภัย</strong><p>การ์ดนี้อ่านหลักฐานเท่านั้น ไม่ส่ง Event ไม่เรียก Stripe API ไม่สร้าง Checkout และไม่เปลี่ยน Invoice หรือ Subscription</p></div>
  </section>
}
