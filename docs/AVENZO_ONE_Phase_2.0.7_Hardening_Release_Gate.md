# AVENZO ONE — Phase 2.0.7 Hardening & Release Gate

วันที่ตรวจรับ Local gate: 14 สิงหาคม 2026  
สถานะ: **Owner Approved / Local Release Candidate Passed / Vercel Preview Pending**

## Release Story

ผู้ใช้ที่มีสิทธิ์เข้า Organization สามารถจัดการ Product/SKU, สร้าง Warehouse/Location และส่งคำสั่ง Receive/Adjust/Transfer ผ่าน Server authorization ไปยังฐานข้อมูล จากนั้น Balance, immutable Ledger, Domain Event และ Audit Log ต้องแสดงผลสอดคล้องกันโดยไม่เปิด direct-write หรือ cross-tenant path

## Local Release Evidence

### Migration และ Database

- canonical Production baseline integrity ผ่าน 90/90 migrations + recovered bridges 7/7
- clean replay จากฐานว่างผ่านบน Local Supabase/Postgres 17.6
- Phase 2.0.3.2–2.0.3.5 migration tests ผ่านครบ
- Phase 2.0.4 Server/Application integration/security test ผ่าน
- Phase 2.0.6 Warehouse trigger/scope resolver/inventory audit test ผ่าน
- transactional rollback rehearsal ผ่านทั้ง Foundation schema set และ server application set
- final schema fingerprint: `576080ff1018957e7cbae31fa5aff8d3e2cdb9d3e63815eb7dbb8c7a57cc4404`
- Security Advisor: no issues
- Performance Advisor: no issues
- DB lint ไม่มี warning ใหม่จาก Phase 2.0; มี warning เดิมเรื่องตัวแปร `v_payment` ไม่ถูกอ่านใน sandbox payment function

Release harness: `supabase/verification/phase-2-0-release-gate-local.ps1`

### Application Regression

- Foundation release contract: 17/17
- Session security regression: 57/57
- Function permission allowlist: 4/4
- Anonymous grant hardening: 5/5
- RLS InitPlan contract: 3/3
- Dark button contrast: 3/3
- Theme persistence: 2/2
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Next.js 15.5.22 Production Build: ผ่าน รวม `/organizations/[id]/products` และ `/organizations/[id]/inventory`

รวม automated application/security/theme contracts ที่รันใน Gate นี้: **91/91 ผ่าน**

### Authenticated Browser → Server → Database → UI

ผ่านเส้นทางจริงบน Local stack:

1. Login ด้วยบัญชีทดสอบ Local
2. เปิด Product/SKU workspace และอ่าน SKU ที่มี Barcode/Sales Code
3. สร้าง Warehouse และ Default Location ผ่าน Foundation Server Action
4. สร้าง Picking Location
5. Receive 10 หน่วย
6. ปฏิเสธ Adjust out 999 พร้อม accessible alert และไม่ทำให้ Stock ติดลบ
7. Adjust out 6 หน่วย
8. Transfer 2 หน่วยจาก Default ไป Picking
9. Balance แสดง 2 + 2 = 4 และ Low-stock indicator ครบสอง Location
10. Ledger แสดง receive, adjustment out และ transfer out/in ครบ 4 movements

Database evidence หลัง browser flow:

| Evidence | จำนวน/ผลลัพธ์ |
| --- | ---: |
| Inventory commands | 3 |
| Stock movements | 4 |
| Inventory domain events | 3 |
| Human-readable inventory audits | 3 |
| Balance total | 4.000000 |
| Ledger delta total | 4.000000 |

ผล reconciliation: **Balance total = Ledger total**

### Accessibility, Theme และ Responsive

- dialogs มี `role=dialog`, `aria-modal`, labelled heading, initial focus และ Escape close
- feedback ผิดพลาดใช้ `role=alert`; success ใช้ `role=status`
- filter controls มี accessible names; desktop table มี column headers; mobile representation ใช้ list/listitem
- keyboard focus และ Escape behavior ตรวจผ่าน browser
- Dark theme persistence, semantic button contrast และไม่มี horizontal overflow ที่ desktop 1280×720 ผ่าน
- Mobile 390×844, table-to-card switch, Dark persistence และ no-overflow มี browser evidence จาก Phase 2.0.6 บน component/code revision เดียวกัน; Phase 2.0.7 เพิ่ม static regression ป้องกัน contract ถอยหลัง

## Findings

1. `.env.local` ชี้ Supabase คนละ instance กับ Local test stack ทำให้ browser login รอบแรกถูกปฏิเสธ แก้เฉพาะ test process ด้วย environment override โดยไม่แก้หรือเปิดเผย secret ในไฟล์ผู้ใช้
2. Supabase breaking-change scan พบ extension version pinning deprecation และ self-hosted gateway/Postgres changes แต่ไม่มีรายการใดกระทบ Phase migration set นี้ เพราะไม่ได้ pin extension version และ Local CLI stack จัดการ runtime image
3. Node test มีคำเตือนเดิมเรื่อง package module type ใน session helper; test ยังผ่านและไม่ใช่ runtime/build failure
4. Webpack แจ้ง big-string cache serialization warning เดิมระหว่าง build; build สำเร็จและไม่ใช่ release blocker ปัจจุบัน

## Gate Decision

**Local Release Candidate Gate: PASSED**

ยังไม่ประกาศ Phase 2.0.7 ว่า Release Gate สมบูรณ์ เพราะ Acceptance Criteria ระบุ Vercel Preview verification และยังไม่มีคำอนุมัติ deploy ภายนอกในรอบนี้

สิ่งที่ยังต้องอนุมัติแยก:

- commit และ push pending work
- สร้าง Vercel Preview deployment
- ตรวจ Preview environment, authentication, responsive และ runtime logs
- apply Supabase Production migrations
- Production deployment/promotion

