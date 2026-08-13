# Phase 2.0.3.1 — Migration Baseline Recovery

วันที่: 13 สิงหาคม 2026

สถานะ: **Owner Approved / Completed**

## 1. ขอบเขตที่ได้รับอนุมัติ

Phase นี้อนุญาตให้ตรวจและกู้ Migration baseline เท่านั้น โดย:

- อ่าน Production migration history แบบ read-only
- กู้ SQL ที่ Production บันทึกไว้เป็นหลักฐานใน Git
- สร้าง manifest และ validator สำหรับตรวจความครบถ้วน
- ห้ามสร้าง Product/SKU/Warehouse/Inventory schema
- ห้ามแก้ `supabase_migrations.schema_migrations`
- ห้าม apply SQL หรือเปลี่ยนข้อมูล/Schema ใน Production

## 2. Findings

| รายการ | ผลตรวจ |
|---|---|
| Production history | 90 migrations |
| เดิมใน `supabase/migrations` | 93 SQL files |
| ชื่อและ timestamp ตรงกัน | 2 รายการ |
| ชื่อเหมือนแต่ timestamp ต่าง | 82 รายการ |
| ชื่อที่มีเฉพาะ Production | 6 รายการ |
| ชื่อที่มีเฉพาะ Git | 9 รายการ |
| SQL archive ที่กู้ได้ | 90/90 รายการ |
| Archive hash เทียบ Production | 90/90 ตรงกัน |
| Recovered bridge SQL | 7 รายการ |
| Clean replay จากฐานว่าง | 90/90 canonical + 7 bridges ผ่าน |
| Schema fingerprint เทียบ Production | 7/7 หมวดตรงกัน |

Production-only names ประกอบด้วย Phase 0.1 จำนวน 3 รายการ และชื่อที่ถูกแก้ระหว่างการ apply อีก 3 รายการ:

- `phase_0_1_organization_branch_core`
- `phase_0_1_harden_soft_delete`
- `phase_0_1_tune_indexes_and_policies`
- `phase_0_2_role_permission_core`
- `phase_0_6_fix_invitation_rpc_return_v2`
- `phase_1_0_3_entitlement_enforcement_safe`

Git-only names มี migration ที่ไม่ได้ปรากฏเป็นชื่อเดียวกันใน Production history รวมถึง Phase 1.0.2 สองไฟล์และ Stripe test checkout หนึ่งไฟล์ จึงห้ามสรุปว่าไฟล์เหล่านี้ถูก apply โดยดูจากชื่อไฟล์เพียงอย่างเดียว

## 3. Recovery artifacts

- `supabase/production-baseline/*.sql` — canonical SQL 90 รายการจาก Production statement history
- `supabase/production-baseline/manifest.json` — version, name และ canonical MD5
- `supabase/production-baseline/verify.mjs` — local integrity validator
- `supabase/production-baseline/README.md` — safety boundary และวิธีตรวจ
- `supabase/production-baseline/replay-local.ps1` — isolated replay harness ที่ล็อก local container
- `supabase/production-baseline/bridges/manifest.json` — bridge order และ SHA-256 จำนวน 7 รายการ
- `supabase/production-baseline/schema-fingerprint.sql` — normalized schema comparison

Archive แยกจาก `supabase/migrations` โดยตั้งใจ เพื่อไม่ให้ Supabase CLI นำไป apply โดยอัตโนมัติ และ migration เดิมใน Git ยังไม่ถูกเปลี่ยนชื่อหรือลบระหว่าง forensic recovery

## 4. Evidence ที่ผ่านแล้ว

1. Production ถูก query แบบ read-only เท่านั้น
2. ดึง `version`, `name` และ `statements` จาก migration history ครบ 90 รายการ
3. ทำ canonical normalization: CRLF → LF และตัด LF ท้ายไฟล์ก่อน hash
4. hash ของ archive ตรงกับ Production 90/90
5. validator ตรวจ file count, missing file, untracked SQL และ hash mismatch ได้
6. ติดตั้ง Docker Desktop 4.86.0 / Engine 29.7.2, WSL 2 kernel และ Supabase CLI 2.114.0 สำเร็จ
7. clean replay บน isolated local Postgres 17.6.1.158 ผ่าน `90/90` canonical migrations
8. พบและกู้ bridge ที่มีผลใน Production schema แต่อยู่นอก Production migration history จำนวน 7 รายการ:
   - Phase 0.7 Git-only 3 migrations
   - Phase 1.0.2 Git-only 2 migrations
   - Stripe test checkout Git-only 1 migration
   - exact current Stripe function definition จาก Production read-only evidence 1 รายการ
9. normalized schema fingerprint ตรง Production ทุกหมวด: tables 65, columns 750, constraints 526, indexes 262, policies 88, functions 130 และ triggers 44
10. replay และ fingerprint ทำกับ local Docker เท่านั้น; Production ถูกอ่านอย่างเดียว

## 5. Gate result

Phase 2.0.3.1 ผ่าน Migration Baseline Gate แล้ว เพราะ canonical archive + recovered bridges สามารถสร้าง schema ใหม่จากศูนย์และให้ fingerprint ตรงกับ Production ทุกหมวดที่กำหนด

ข้อจำกัดที่ยังคงใช้:

1. Archive/bridge artifacts เป็น recovery evidence ไม่ใช่ forward Production migrations
2. ห้ามแก้ Production history เพื่อให้ตรง Git
3. ห้าม apply Production โดยไม่มีอนุมัติแยก
4. Phase 2.0.3.2 Product/SKU Schema ต้องได้รับอนุมัติเริ่มงานแยก

ขั้นถัดไปที่เข้า Gate ได้คือ **Phase 2.0.3.2 Product/SKU Schema** แต่ยังไม่เริ่มจนกว่าเจ้าของระบบอนุมัติ

## 6. Production impact

ไม่มี Production mutation, ไม่มี migration apply, ไม่มีการแก้ history และไม่มี Product/Inventory schema change ใน Phase นี้
