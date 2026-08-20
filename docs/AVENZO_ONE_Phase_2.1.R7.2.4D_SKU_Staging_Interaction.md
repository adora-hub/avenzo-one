# AVENZO ONE — Phase 2.1.R7.2.4D SKU Staging Interaction

วันที่: 15 สิงหาคม 2026

สถานะ: **Owner Approved / Local Gate Completed**

## Outcome

R7.2.4D ทำเฉพาะ SKU Staging Interaction ใน Section `SKU แรกและรหัสสินค้า` ตาม Approved Mockup โดยไม่เริ่ม Validation Summary หรือ Success/Recovery Interaction

- ปุ่ม `เก็บ SKU นี้และเพิ่มรายการถัดไป` ตรวจข้อมูลแล้วเก็บ SKU ลง Browser Draft
- แสดง Count, Empty state และตาราง SKU ตาม Mockup
- ตารางแสดงชื่อรุ่น/SKU, SKU Code, Sales Code, Barcode, Base Unit และสถานะฉบับร่าง
- รองรับแก้ไข, บันทึกการแก้ไข, ยกเลิกแก้ไข และลบรายการ
- หลังเก็บ SKU ใหม่ ระบบล้าง Editor และพร้อมกรอกรายการถัดไป
- Sales Code sequence เลื่อนไปค่าถัดไปเมื่อเก็บ SKU ใหม่สำเร็จ แต่ไม่เลื่อนเมื่อแก้ไขรายการเดิม
- Summary นับ SKU ที่เตรียมสร้างและใช้รายการแรกเป็น Initial SKU ของ Contract ปัจจุบัน

## Validation และ Security

1. Browser Draft จำกัดสูงสุด 100 SKU และ Payload รวมไม่เกิน 256 KB
2. SKU ที่ Restore จาก Browser ถูก Normalize, จำกัดความยาว, ตรวจ Control characters, Code pattern, Base Unit allowlist และ Identifier ซ้ำ
3. ก่อนเก็บ SKU ระบบตรวจ SKU Code, Sales Code และ Barcode กับข้อมูลจริงภายใน Organization ผ่าน Authenticated Server Action, Session, RLS และ `product.manage`
4. ตรวจ Identifier ซ้ำข้าม SKU ทุกคอลัมน์ภายใน Staging list เพื่อไม่ให้รหัสเดียว resolve ไปคนละ `sku_id`
5. ป้องกัน Async response เก่าด้วย Request identity และ Snapshot comparison
6. Staging เป็น Browser Draft เท่านั้น การเพิ่ม/แก้ไข/ลบรายการไม่เขียน Product, SKU หรือ Stock ลงระบบ

## Atomic Command Boundary

R7.1 `product.create_with_initial_sku` รองรับ Product + Initial SKU หนึ่งรายการใน Transaction เดียวเท่านั้น รอบนี้จึงใช้กฎต่อไปนี้:

- ถ้ามี SKU ที่เก็บไว้ 1 รายการ สามารถ Map รายการนั้นเป็น Initial SKU ของ R7.1 ได้
- ถ้ามีมากกว่า 1 รายการ ระบบจะหยุดก่อนส่งและแจ้งข้อจำกัดอย่างตรงไปตรงมา
- ห้ามส่งเฉพาะรายการแรกแล้วทิ้งรายการที่เหลือ
- ห้ามเรียก `sku.create` หลายครั้งต่อท้ายแบบไม่ Atomic เพราะอาจเกิด Partial Product
- Multi-SKU persistence ต้องผ่าน Domain/Command gate แยก ซึ่งกำหนด Idempotency, Transaction, Identifier allocation และ Recovery ก่อนเปิดใช้จริง

## Verification

- R7.2.4D targeted interaction: **10/10 ผ่าน**
- Product R1–R7.2.4D regression: **129/129 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Authenticated Desktop Light บน Route จริง:
  - ใช้ Sequence `R7DZ001 → R7DZ002`
  - ตรวจ Server แล้วเก็บ SKU รายการแรกสำเร็จ
  - Reload แล้วกู้คืน Staged SKU ได้
  - แก้ไขและยกเลิกแก้ไขโดยรายการเดิมไม่เปลี่ยน
  - ป้องกัน SKU Code ซ้ำภายในรายการ
  - เก็บ SKU รายการที่สองและแสดง Count 2
  - ลบ SKU ทดสอบทั้งสองรายการและบันทึก Browser Draft กลับเป็นรายการว่าง
- ไม่กด `ตรวจสอบและสร้าง`, ไม่สร้าง Product/SKU และไม่เขียนข้อมูลระบบ

Node แสดงเฉพาะ `MODULE_TYPELESS_PACKAGE_JSON` warning เดิมของ Test runner ซึ่งไม่ทำให้การทดสอบล้มเหลว

## Scope Boundary

- ไม่เริ่ม Validation/Security Summary Interaction
- ไม่เริ่ม Success/Recovery Interaction
- ไม่เพิ่ม Multi-SKU Database/RPC/Command contract
- ไม่แก้ Image lifecycle หรือ Inventory authority
- ไม่ apply Supabase Preview/Production
- ไม่ commit, push หรือ deploy ใน Part นี้

## Next Gate

Owner อนุมัติ R7.2.4D แล้ว และ R7.2.4E ถูกดำเนินการ/บันทึกผลใน `AVENZO_ONE_Phase_2.1.R7.2.4E_Validation_Summary_Interaction.md`
