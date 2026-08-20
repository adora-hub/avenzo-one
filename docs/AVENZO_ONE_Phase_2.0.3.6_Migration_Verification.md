# Phase 2.0.3.6 — Migration Verification

วันที่: 13 สิงหาคม 2026  
สถานะ: **Owner Approved / Completed Locally**  
Production: **ไม่ apply และไม่แก้ Migration History/Schema/Data ของ Production**

## เป้าหมาย

พิสูจน์ว่า canonical Production baseline + recovered bridges + Phase 2.0.3.2–2.0.3.5 สามารถสร้างฐานใหม่ได้ซ้ำอย่าง deterministic, rollback ธุรกรรมที่ยังไม่ commit ได้สะอาด และผ่าน domain/security gates ก่อนเข้าสู่ Server/Application Foundation

Supabase แนะนำให้ใช้ clean reset/replay เพื่อยืนยันว่า migration สามารถสร้างฐานใหม่ได้จากศูนย์ Phase นี้ใช้หลักการเดียวกัน แต่ใช้ isolated recovery harness เพราะ canonical Production archive ถูกแยกจาก `supabase/migrations` โดยตั้งใจและห้ามนำไป apply Production อัตโนมัติ

## Verification harness

เพิ่ม:

- `supabase/verification/phase-2-0-3-verify-local.ps1`

Safety guard:

- ยอมรับเฉพาะ container `supabase_db_avenzo-one-local`
- ใช้ database `postgres` ภายใน local Supabase Docker เท่านั้น
- ทุก SQL call ใช้ `ON_ERROR_STOP=1`
- test fixtures อยู่ใน transaction และ `ROLLBACK`
- ไม่มี remote project reference, Production connection string หรือ `--linked`

## Clean rebuild procedure

ดำเนินการสองรอบจาก local volume ว่าง:

1. ลบเฉพาะ volume ของ `avenzo-one-local` ด้วย `supabase stop --no-backup`
2. เริ่ม database-only local Supabase Postgres 17.6
3. replay canonical baseline 90/90 migrations
4. replay recovered bridges 7/7 รายการ
5. ทำ transactional rollback rehearsal ของ Phase 2.0.3.2–2.0.3.5 ทั้งชุด
6. ยืนยันว่า rollback แล้ว Phase tables เหลือ 0
7. apply forward migration และรัน test ของแต่ละ Phase ตาม dependency order
8. ตรวจ table/RLS/policy/permission/FK-index gate
9. คำนวณ normalized schema fingerprint SHA-256
10. ล้าง local volume และทำซ้ำตั้งแต่ข้อ 2

## ผลการทดสอบ

ทั้งสองรอบผ่าน:

```text
BASELINE_REPLAY_COMPLETE 90/90
BRIDGE_APPLIED 7/7
PHASE_2_0_3_TRANSACTIONAL_ROLLBACK_REHEARSAL_PASSED
PHASE_2_0_3_2_PRODUCT_SKU_TESTS_PASSED
PHASE_2_0_3_3_WAREHOUSE_LOCATION_TESTS_PASSED
PHASE_2_0_3_4_INVENTORY_LEDGER_BALANCE_TESTS_PASSED
PHASE_2_0_3_5_PERMISSION_RLS_SECURITY_TESTS_PASSED
PHASE_2_0_3_MIGRATION_GATE_PASSED
PHASE_2_0_3_CLEAN_VERIFICATION_COMPLETE
```

Fingerprint:

| รอบ | SHA-256 |
|---|---|
| Clean build 1 | `ac4edb9c3db0824b295ecdf98ff2d74cde5203aa3c8fdec6313814bbdee6f756` |
| Clean build 2 | `ac4edb9c3db0824b295ecdf98ff2d74cde5203aa3c8fdec6313814bbdee6f756` |

ผล: **ตรงกัน 100%**

Final local schema summary:

- Public tables: 57
- Public functions: 78
- Public policies: 87
- Permission catalog: 21 รายการ โดยเป็น Foundation domain permissions 8 รายการ
- Foundation tables: 8/8
- Foundation RLS: 8/8
- Reviewed Foundation SELECT policies: 8/8
- Foreign-key index gate: ผ่าน

## Advisors และ lint

```text
supabase db advisors --local --type all --level warn --fail-on error
No issues found
```

`supabase db lint --local --level warning` ไม่พบ warning ใหม่จาก Phase 2.0.3 เหลือ warning เดิมหนึ่งรายการใน `public.platform_simulate_sandbox_payment_event` เพราะตัวแปร `v_payment` ไม่ถูกอ่าน ซึ่งอยู่นอกขอบเขต Foundation Slice

Production baseline integrity validator ยังผ่าน:

```text
Production baseline verified: 90/90 canonical SQL files + 7 bridges
```

## Rollback และ compensation strategy

### ก่อน transaction commit

Migration Phase 2.0.3.2–2.0.3.5 เป็น transactional SQL และ rehearsal ยืนยันแล้วว่าเมื่อ `ROLLBACK` จะไม่เหลือ Foundation object ใด (`0/8` tables)

### หลัง migration commit

ห้ามใช้ destructive down migration เพื่อลบ Product/SKU, Warehouse/Location, Ledger, Balance หรือ Event เพราะอาจทำลายประวัติธุรกิจและ audit evidence ให้ใช้ลำดับนี้:

1. rollback application deployment ไป version ก่อนหน้า
2. ปิด Foundation commands/route ด้วย server-side release control
3. คง additive schema และ RLS ไว้เพื่อไม่ให้ข้อมูลสูญหาย
4. ระงับ mutation และตรวจ reconciliation/evidence
5. แก้ด้วย reviewed forward migration ใหม่
6. apply Production เฉพาะเมื่อได้รับ approval แยก พร้อม backup, dry-run และ release evidence

ในช่วงนี้ application Production เดิมยังไม่อ้าง Foundation tables จึงสามารถ rollback application ได้โดยไม่ต้อง drop schema

## Breaking-change review

- Local runtime ใช้ Postgres 17 ซึ่งตรงกับ Supabase default ปัจจุบันสำหรับ project ใหม่
- Migration ไม่ pin extension version จึงไม่ชนกับการเลิกสนับสนุน explicit extension version pinning
- ตารางใหม่ใช้ explicit grants และ RLS จึงรองรับการเปลี่ยนแปลงที่ตารางใหม่จะไม่ถูก expose ผ่าน Data API โดยอัตโนมัติ
- ไม่ใช้ `auth.role()`; policies ใช้ `TO authenticated` พร้อม authorization predicate

เอกสารอ้างอิง:

- Supabase Local Development Workflow: `https://supabase.com/docs/guides/local-development/cli-workflows`
- Supabase Database Migrations: `https://supabase.com/docs/guides/deployment/database-migrations`
- Supabase breaking-change changelog: `https://supabase.com/changelog?types=breaking-change`

## Gate result

Phase 2.0.3 Database, RLS & Migration **ผ่านและปิด local gate ครบ 2.0.3.1–2.0.3.6**

ขั้นถัดไปที่เข้า Gate ได้คือ **Phase 2.0.4 Server/Application Foundation** เพื่อสร้าง repository/service, read models, server commands, validation/error mapping และ application authorization โดยต้องได้รับอนุมัติเริ่มงานแยก

ยังไม่อนุญาตให้ apply Supabase Production, Commit หรือ Push จนกว่าเจ้าของระบบจะสั่งแยก
