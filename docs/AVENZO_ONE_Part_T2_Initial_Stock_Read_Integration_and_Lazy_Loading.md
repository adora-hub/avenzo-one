# AVENZO ONE — Part T2 Initial Stock Read Integration & Lazy Loading

วันที่เสร็จ: 18 สิงหาคม 2026  
สถานะ: **Completed locally — Read-only integration**

## ผลลัพธ์

- หน้า Product Creation ไม่ query Warehouse หรือ Location ตอนเปิดหน้า
- เมื่อเปิด switch “สต็อกเริ่มต้น” จึงเรียก Server Action เพื่อโหลดข้อมูลจริง
- ตรวจ active session, membership, Organization context, `warehouse.read` และ `inventory.receive` ก่อน query
- อ่าน Warehouse และ Location ที่ active ผ่าน Foundation Read Repository และ RLS เดิม
- ส่งกลับ Client เฉพาะ ID, Branch ID, Warehouse ID, Code, Name และ Default flag ที่ UI ใช้
- เลือกแบบ cascading Branch → Warehouse → Location
- เลือก default Location ของ Warehouse ให้อัตโนมัติ
- รองรับ loading, permission denied, error/retry และ empty state
- Cache ข้อมูลใน Client state หลังโหลดครั้งแรก; ปิด–เปิด switch ไม่ query ซ้ำ
- เปลี่ยน Organization ด้วย navigation จะสร้าง state ชุดใหม่
- Standard และ Variant ใช้ destination จริง
- Bundle ยังไม่เชื่อมตาม T1: Virtual ไม่มี Bundle Stock และ Preassembled รอ Assembly Contract

## Security boundary

- Browser ไม่ถือ service-role key
- Server Action ตรวจสิทธิ์ก่อนสร้าง repository query
- RLS และ branch scope ยังคงเป็น database authority
- T2 ไม่มี direct table mutation, Migration, RPC ใหม่ หรือ Inventory Command
- Initial Stock quantity ยังไม่ถูกส่งไป Backend และยังไม่สร้าง Stock Movement

## Verification

- Products Inventory UI regression: **16/16 ผ่าน**
- T2 lazy-load regression: **4/4 ผ่าน**
- Unified Product Creation regression: **7/7 ผ่าน**
- TypeScript `tsc --noEmit`: **ผ่าน**
- Next.js production build: **ผ่าน**, static generation 39/39, exit code 0

## Files

- `web/src/app/actions/foundation.ts`
- `web/src/app/organizations/[id]/products/new/page.tsx`
- `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`
- `web/scripts/test-products-initial-stock-t2-read.mjs`
- `web/scripts/test-products-r7-inventory-components.mjs`
- `web/package.json`

## Stop gate

หยุดก่อน Part T3 ตามลำดับเดิม เพื่อให้ Owner ตรวจ/อนุมัติการเชื่อม Application Workflow: activate Product/SKU → idempotent Inventory receive → recovery ราย SKU
