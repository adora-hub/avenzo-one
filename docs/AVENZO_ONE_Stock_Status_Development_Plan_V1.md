# AVENZO ONE — Stock Status Development Plan V1

สถานะ: Phase SS-01 กำลังพัฒนาใน Localhost  
ขอบเขต: Product Workspace และ SKU Variant preview เท่านั้น  
ข้อห้าม: ไม่เปลี่ยนยอดสต็อก, Stock Movement, Order allocation หรือกติกาตัดสต็อก

## เป้าหมาย

แยก “จำนวนสต็อก” ออกจาก “สถานะสต็อก” เพื่อให้ผู้ใช้มองเห็นความเร่งด่วนได้ทันที โดยไม่ทำให้คอลัมน์จำนวนสต็อกแน่นเกินไป

## Phase SS-01 — 4 สถานะแรก

ลำดับความสำคัญใช้กฎที่เสี่ยงกว่าชนะเสมอ:

1. **หมดสต็อก** — ทุก SKU ไม่มียอดพร้อมขาย
2. **ใกล้หมด** — มี SKU ใดหมด หรือยอดพร้อมขายต่ำกว่าหรือเท่ากับ `Reorder Min`; ถ้าไม่กำหนด ใช้ `Safety Stock`; ถ้ายังไม่กำหนด ใช้ค่าเริ่มต้น 5
3. **เข้าใหม่** — มี Receive Movement ภายใน 7 วัน และสินค้าไม่ติดสถานะหมด/ใกล้หมด
4. **ปกติ** — มียอดพร้อมขายสูงกว่าเกณฑ์แจ้งเตือน และไม่มี Receive Movement ใหม่ตามช่วงเวลา

ข้อกำหนดเพิ่มเติม:

- Product หลาย SKU จะเป็น “หมดสต็อก” เมื่อทุก SKU หมดเท่านั้น
- ถ้ามีบาง SKU หมด แต่ยังมี SKU อื่นขายได้ ให้แสดง “ใกล้หมด” และอธิบายใน Tooltip
- ผู้ไม่มี `inventory_movement.read` ยังเห็น หมด/ใกล้หมด/ปกติจากยอดที่มีสิทธิ์อ่าน แต่จะไม่ถูกจัดเป็น “เข้าใหม่”
- สถานะเป็นข้อมูลคำนวณเพื่อช่วยตัดสินใจ ไม่เขียนทับ Inventory Ledger

## UI มาตรฐาน

- เพิ่มคอลัมน์ `สถานะสต็อก` ต่อจากคอลัมน์ `สต็อก`
- ใช้ Status Badge ตาม AVENZO ONE Design System:
  - หมดสต็อก = Danger
  - ใกล้หมด = Warning
  - ปกติ = Info
  - เข้าใหม่ = Success
- Badge มี Tooltip อธิบายเหตุผลและรองรับ Keyboard focus
- รองรับการจัดเรียงและ Customize Columns
- Mobile card แสดง Badge แยกจากข้อความจำนวนสต็อก

## ระยะถัดไป (ยังไม่ทำใน SS-01)

- SS-02: ตัวกรองสถานะทั้ง Dataset และสรุปจำนวนตามสถานะ
- SS-03: Settings Drawer สำหรับจำนวนวัน “เข้าใหม่”, fallback threshold และเปิด/ปิดสถานะ
- SS-04: “ค้างสต็อก” และ “ขายดี” หลัง Order/Invoice มีข้อมูลยอดขายที่เชื่อถือได้
- SS-05: Notification/Task escalation และกฎแจ้งเตือนรายสาขา

## Acceptance Criteria SS-01

- สถานะไม่เปลี่ยนยอดสต็อกและไม่สร้าง Movement
- หมด/ใกล้หมดชนะเข้าใหม่เสมอ
- Variant ที่หมดบางรายการไม่ทำให้ Product ทั้งรายการถูกระบุว่า “หมดสต็อก”
- Tooltip บอก SKU หรือเกณฑ์ที่ทำให้เกิดคำเตือน
- TypeScript, Production Build และ Product regression tests ผ่าน
- ตรวจหน้า Product Workspace บน Localhost ทั้ง Desktop และ Variant panel
