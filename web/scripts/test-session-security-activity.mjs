import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile('../supabase/migrations/20260811162000_phase_1_2_2_5_4_session_security_activity.sql', 'utf8')
const page = await readFile('src/app/account/security/sessions/page.tsx', 'utf8')
const component = await readFile('src/app/account/security/sessions/session-security-activity.tsx', 'utf8')

test('activity RPC is owner scoped and authenticated only', () => {
  assert.match(migration, /where e\.user_id = v_user_id/)
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/)
  assert.match(migration, /security definer/)
  assert.match(migration, /revoke all on function public\.app_list_my_session_security_activity\(integer\) from public, anon/)
  assert.match(migration, /grant execute on function public\.app_list_my_session_security_activity\(integer\) to authenticated/)
})

test('activity RPC exposes only a safe projection', () => {
  const signature = migration.match(/returns table \(([\s\S]*?)\)\s*language plpgsql/)?.[1] ?? ''
  assert.doesNotMatch(signature, /\bsession_id\b|\buser_id\b|\bmetadata\b|\bip_address\b|\btoken\b/)
  assert.match(signature, /event_action text/)
  assert.match(signature, /device_label text/)
  assert.match(migration, /least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)/)
})

test('page loads sessions and activity together without browser-supplied owner identity', () => {
  assert.match(page, /Promise\.all/)
  assert.match(page, /rpc\('app_list_my_session_security_activity', \{ p_limit: 20 \}\)/)
  assert.doesNotMatch(page, /p_user_id/)
  assert.match(page, /SessionSecurityActivity/)
})

test('activity UI provides human-readable Thai labels and safe privacy disclosure', () => {
  assert.match(component, /เริ่มใช้งาน Session ใหม่/)
  assert.match(component, /ออกจากระบบอุปกรณ์อื่นทั้งหมด/)
  assert.match(component, /ยังไม่มีกิจกรรมความปลอดภัยสำหรับบัญชีนี้/)
  assert.match(page, /Event Metadata/)
})
