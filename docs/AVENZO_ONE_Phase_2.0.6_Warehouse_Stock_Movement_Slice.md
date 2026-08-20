# AVENZO ONE — Phase 2.0.6 Warehouse & Stock Movement Slice

วันที่ตรวจรับ: 13 สิงหาคม 2026  
สถานะ: **Owner Approved / Completed Locally**

## ผลลัพธ์

Phase 2.0.6 เชื่อม Warehouse, Location, Inventory Balance และ immutable Stock Movement Ledger เป็น vertical slice ที่ใช้งานผ่าน Organization workspace ได้แล้ว ทุก mutation ผ่าน Foundation Server Action และแปลงตัวระบุสินค้าเป็น `sku_id` ก่อนบันทึก movement เสมอ

ขอบเขตที่ส่งมอบ:

- Warehouse directory พร้อมค้นหา กรองตาม Branch/สถานะ ดูรายละเอียด แก้ไข ปิดใช้งาน และ Archive
- Location directory ภายใน Warehouse รวม Default Location ที่ฐานข้อมูลสร้างให้อัตโนมัติ
- Inventory Balance แสดง On hand, Allocated และ Available พร้อม Low-stock/Out-of-stock indicator
- Movement Ledger แบบ immutable พร้อมกรอง SKU, Warehouse, Location และ movement type
- Receive, Adjust และ Transfer พร้อม reason, actor, command ID และ duplicate-command protection
- Desktop table, Mobile card, loading, empty, error, permission/read-only และ Light/Dark states
- Navigation จาก Organization workspace และ Application Shell

Reorder Queue, Suggested PO, Supplier/PO lifecycle และ PO Receiving ยังไม่รวมใน Phase นี้

## Application และ Security Boundary

- Read path ใช้ user-scoped Supabase client และ RLS repository เท่านั้น
- Write path ใช้ verified actor context, application permission/branch-scope gate และ service-role-only database RPC
- Branch scope resolver ตรวจจำนวน entity แบบ fail-closed และปฏิเสธ missing/cross-tenant ID
- `authenticated`, `anon` และ `public` ไม่มีสิทธิ์เรียก server resolver หรือเขียน inventory table โดยตรง
- Receive/Adjust/Transfer ใช้ atomic posting primitive, idempotency และ negative-stock deny-all จากฐานข้อมูล
- Balance เป็นผลสรุปจาก immutable movement และ UI ไม่มีเส้นทางแก้ balance โดยตรง
- Inventory domain event สร้าง Organization Audit Log ที่อ่านได้โดยมนุษย์แบบหนึ่งต่อหนึ่ง

## Integration Defects ที่พบและแก้แล้ว

1. Deferred default-location trigger ทำงานหลัง service-role command แต่เดิมไม่มี table privilege ตอนจบ transaction แก้โดยใช้ `SECURITY DEFINER`, กำหนด `search_path = ''` และถอน execute จากทุก runtime role
2. Location/Inventory command เคยพยายามอ่าน Warehouse/Location ด้วย admin client ทั้งที่ direct grants ถูกถอน แก้ด้วย service-role-only resolver ที่ตรวจ tenant และ branch แบบ fail-closed
3. Balance query เคยสมมติ direct relationship จาก balance ไป Warehouse แก้เป็น relationship จริงผ่าน Location → Warehouse
4. Inventory domain event มี immutable technical evidence แต่ยังไม่มี human-readable Organization audit แก้ด้วย private trigger ที่ append audit row แบบหนึ่งต่อหนึ่ง

Forward migration: `supabase/migrations/20260813162443_phase_2_0_6_warehouse_command_trigger_security.sql`

## Verification Evidence

ผ่านแล้วใน Local environment:

- Warehouse/Stock contract tests: 4/4
- Foundation regression: 3/3
- Product/SKU regression: 3/3
- Operations UI regression: 4/4
- TypeScript: `tsc --noEmit --incremental false`
- SQL integration/security test แบบ transaction rollback
- Supabase Security Advisor: no issues
- Supabase Performance Advisor: no issues
- Database lint: ไม่มี warning ใหม่จาก Phase 2.0.6; เหลือ warning เดิมเรื่องตัวแปรที่ไม่ได้ใช้ใน sandbox payment function
- Next.js 15.5.22 Production Build: ผ่าน รวม route `/organizations/[id]/inventory`

Authenticated browser verification ผ่านกรณีต่อไปนี้:

- Empty state → Create Warehouse → Create Location
- Receive 10 → Adjust out 6 → Transfer 2 โดยยอดรวม reconcile ถูกต้อง
- ปฏิเสธ Adjust out 999 พร้อมข้อความ negative-stock ที่เข้าใจได้
- Balance แสดง low-stock หลังยอดลดลง และ Ledger แสดง receive/adjustment/transfer pair ครบ
- Movement filter, Detail Sheet, Dark-mode persistence และ Mobile 390×844 ผ่าน
- ไม่พบ error overlay, console error หรือ horizontal overflow ในรอบตรวจรับสุดท้าย

## Release Boundary

- migration ถูก apply เฉพาะ Local Supabase เพื่อทดสอบ
- ยังไม่มี Supabase Production apply
- ยังไม่มี commit, push, Vercel Preview หรือ Production deployment จากการอนุมัติ Phase นี้
- ขั้นถัดไปคือ **Phase 2.0.7 Hardening & Release Gate** และต้องได้รับอนุมัติแยก

