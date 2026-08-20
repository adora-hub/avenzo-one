# AVENZO ONE — Phase 2.1.R7.2.4E Validation Summary Interaction

วันที่: 15 สิงหาคม 2026

สถานะ: **Implemented Locally / Owner Approved for Sequential Execution**

## Outcome

R7.2.4E ทำเฉพาะ Validation Summary Interaction ตาม Approved Mockup โดยรวมข้อผิดพลาดไว้ด้านบนของฟอร์มและเชื่อมกับ Summary Timeline โดยไม่เริ่ม Success/Recovery Interaction

- แสดงจำนวนจุดที่ต้องแก้และเหตุผลครบทุกจุดใน Alert เดียว
- แต่ละรายการเป็นปุ่มนำทางไปยังช่องหรือ Section ที่เกี่ยวข้อง
- Scroll, Focus, `aria-invalid` และ Error outline ทำงานกับ Keyboard/Screen reader
- Timeline แสดงเครื่องหมายเตือนและจำนวนข้อผิดพลาดแยกตาม Section
- ปิด Browser-native validation bubble ด้วย `noValidate` เพื่อให้การนำทางเป็นรูปแบบเดียวกัน
- ปุ่ม `ตรวจสอบและสร้าง` ยังใช้ตรวจข้อมูลได้เมื่อ Category master ว่าง แต่ Validation จะหยุดก่อน Mutation และชี้ไปที่หมวดหมู่

## Validation Coverage

1. ชื่อสินค้าและหมวดหมู่
2. รูปสินค้าอย่างน้อย 1 ภาพและสถานะอัปโหลดล้มเหลว
3. SKU ที่กำลังแก้ไข, SKU ที่ยังไม่เก็บ, Multi-SKU atomic boundary และ SKU field rules
4. Advisory duplicate check ของ SKU Code, Sales Code และ Barcode ต้องผ่านก่อน Submit
5. ราคาขาย
6. น้ำหนัก/ขนาดสินค้าเทียบกล่อง
7. Packaging, Sell unit และ Bundle rules
8. Safety Stock, Min/Max และสาขาที่เปิดขาย
9. Control characters และขนาด Browser Draft 256 KB

UI Validation เป็น Navigation/Feedback layer เท่านั้น ส่วน Session, Permission, Unique, RLS และ Transaction Validation ยังใช้ Server เป็น Authority ขั้นสุดท้าย

## Verification

- R7.2.4E targeted interaction: **10/10 ผ่าน**
- Product R1–R7.2.4E regression: **139/139 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Authenticated Desktop Light บน Route จริง:
  - Validation Summary แสดง 5 จุดจาก Browser Draft ปัจจุบัน
  - Timeline แสดง `ข้อมูลทั่วไป 1`, `รูปสินค้า 1`, `SKU แรก 2`, `ราคาและภาษี 1`
  - คลิกรายการหมวดหมู่แล้ว Focus ไป `select[name="categoryId"]`
  - Element เป้าหมายมี `aria-invalid="true"`
  - ไม่เรียก Atomic creation และไม่เขียน Product, SKU, Image หรือ Stock

Node แสดงเฉพาะ `MODULE_TYPELESS_PACKAGE_JSON` warning เดิมของ Test runner ซึ่งไม่ทำให้การทดสอบล้มเหลว

## Scope Boundary

- ไม่เริ่ม Success/Recovery Interaction
- ไม่เปลี่ยน Atomic command หรือเพิ่ม Multi-SKU persistence
- ไม่ apply Supabase Preview/Production
- ไม่ commit, push หรือ deploy ใน Part นี้

## Next Gate

ตามคำอนุมัติแบบลำดับของ Owner ขั้นถัดไปคือ **R7.2.4F — Success & Recovery Interaction** เพียง Part เดียว ต้องพัฒนา ทดสอบ และอัปเดตเอกสารให้เสร็จก่อนเริ่ม R7.2.5
