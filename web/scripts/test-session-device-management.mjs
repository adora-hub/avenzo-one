import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { getCurrentSessionDeviceMetadata } from '../src/lib/session-device.ts'

const migration = await readFile('../supabase/migrations/20260811150000_phase_1_2_2_5_1_session_device_management_ui.sql', 'utf8')
const page = await readFile('src/app/account/security/sessions/page.tsx', 'utf8')
const heartbeat = await readFile('src/app/components/session-activity-heartbeat.tsx', 'utf8')
const dashboard = await readFile('src/app/dashboard/page.tsx', 'utf8')

test('detects safe browser and operating-system display metadata', () => {
  assert.deepEqual(
    getCurrentSessionDeviceMetadata('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0'),
    {
      browserName: 'Microsoft Edge',
      operatingSystem: 'Windows',
      deviceLabel: 'Microsoft Edge บน Windows',
    },
  )
  assert.equal(
    getCurrentSessionDeviceMetadata('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1').operatingSystem,
    'iOS / iPadOS',
  )
})

test('session listing RPC is ownership-scoped and does not return raw session IDs', () => {
  assert.match(migration, /create or replace function public\.app_list_my_sessions\(\)/)
  assert.match(migration, /where s\.user_id = v_user_id/)
  assert.match(migration, /auth\.uid\(\)/)
  assert.match(migration, /revoke all on function public\.app_list_my_sessions\(\) from public, anon/)
  assert.match(migration, /grant execute on function public\.app_list_my_sessions\(\) to authenticated/)

  const returnSignature = migration.match(/app_list_my_sessions\(\)\s*returns table \(([\s\S]*?)\)\s*language plpgsql/)?.[1] ?? ''
  assert.doesNotMatch(returnSignature, /\bsession_id\b/)
  assert.doesNotMatch(returnSignature, /access_token|refresh_token|ip_address/)
})

test('device metadata RPC can update only the caller current session', () => {
  assert.match(migration, /app_update_current_session_device/)
  assert.match(migration, /where s\.session_id = v_session_id\s+and s\.user_id = v_user_id/)
  assert.doesNotMatch(migration, /user_agent text|ip_address/)
  assert.match(heartbeat, /updateCurrentSessionDeviceMetadata/)
  assert.match(heartbeat, /window\.navigator\.userAgent/)
})

test('read-only page clearly labels current device and contains no revoke action', () => {
  assert.match(page, /อุปกรณ์ที่เข้าใช้งาน/)
  assert.match(page, /อุปกรณ์นี้/)
  assert.match(page, /ขั้นนี้เป็นการดูข้อมูลเท่านั้น/)
  assert.match(page, /app_list_my_sessions/)
  assert.doesNotMatch(page, /ยกเลิก Session นี้|ออกจากระบบอุปกรณ์นี้/)
  assert.match(dashboard, /href="\/account\/security\/sessions"/)
})
