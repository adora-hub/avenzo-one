export type SessionSecurityActivityRow = {
  event_id: string
  event_action: string
  occurred_at: string
  device_label: string | null
  browser_name: string | null
  operating_system: string | null
  policy_tier: 'privileged' | 'organization'
  policy_version: number
  is_current_device: boolean
}

const activityLabels: Record<string, { title: string; description: string; tone: string }> = {
  session_registered: {
    title: 'เริ่มใช้งาน Session ใหม่',
    description: 'ระบบลงทะเบียนอุปกรณ์นี้กับนโยบายความปลอดภัยแล้ว',
    tone: 'active',
  },
  session_policy_reassigned: {
    title: 'ปรับนโยบาย Session',
    description: 'ระบบปรับ Session ให้ใช้นโยบายความปลอดภัยล่าสุด',
    tone: 'invited',
  },
  session_device_revoked: {
    title: 'ออกจากระบบอุปกรณ์',
    description: 'เจ้าของบัญชีสั่งให้อุปกรณ์นี้ออกจากระบบ',
    tone: 'canceled',
  },
  session_other_devices_revoked: {
    title: 'ออกจากระบบอุปกรณ์อื่นทั้งหมด',
    description: 'เจ้าของบัญชีสั่งให้อุปกรณ์อื่นออกจากระบบ โดยคงอุปกรณ์ปัจจุบันไว้',
    tone: 'canceled',
  },
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function deviceDescription(activity: SessionSecurityActivityRow) {
  const platform = [activity.browser_name, activity.operating_system].filter(Boolean).join(' · ')
  return platform || 'ยังไม่มีข้อมูลเบราว์เซอร์และระบบปฏิบัติการ'
}

export function SessionSecurityActivity({
  activities,
  errorMessage,
}: {
  activities: SessionSecurityActivityRow[]
  errorMessage?: string
}) {
  return (
    <section className="card session-security-activity" aria-labelledby="session-security-activity-title">
      <div className="session-activity-heading">
        <div>
          <div className="eyebrow">Phase 1.2.2.5.4 · Security Activity</div>
          <h2 id="session-security-activity-title">ประวัติกิจกรรมความปลอดภัย</h2>
          <p>แสดงกิจกรรมล่าสุดของ Session บัญชีคุณสูงสุด 20 รายการ</p>
        </div>
        <span className="feature-count">{activities.length} รายการ</span>
      </div>

      {errorMessage ? (
        <div className="error" role="alert">{errorMessage}</div>
      ) : activities.length ? (
        <ol className="session-activity-list">
          {activities.map((activity) => {
            const label = activityLabels[activity.event_action] ?? {
              title: 'กิจกรรม Session',
              description: 'ระบบบันทึกการเปลี่ยนแปลงด้านความปลอดภัยของ Session',
              tone: 'invited',
            }
            return (
              <li key={activity.event_id}>
                <div className="session-activity-marker" aria-hidden="true" />
                <div className="session-activity-body">
                  <div className="status-title-row">
                    <h3>{label.title}</h3>
                    <span className={`status ${label.tone}`}>{formatDate(activity.occurred_at)}</span>
                    {activity.is_current_device ? <span className="status invited">อุปกรณ์นี้</span> : null}
                  </div>
                  <p>{label.description}</p>
                  <div className="session-activity-meta">
                    <strong>{activity.device_label ?? 'ไม่ทราบชื่ออุปกรณ์'}</strong>
                    <span>{deviceDescription(activity)}</span>
                    <span>{activity.policy_tier === 'privileged' ? 'บัญชีสิทธิ์สูง' : 'บัญชีองค์กร'} · Policy v{activity.policy_version}</span>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="empty">ยังไม่มีกิจกรรมความปลอดภัยสำหรับบัญชีนี้</div>
      )}
    </section>
  )
}
