# AVENZO ONE — Rapid-UI-10D Compact Step 3 Report

Status: Local Verification Passed — Pending Owner Visual Test

## Scope

- รวมชื่อ Step 3 และคำอธิบายการใช้คีย์บอร์ดไว้ในแถวเดียว
- คงตัวนับ ทั้งหมด / เลือกแล้ว / พร้อมสร้าง / ต้องแก้ ไว้ด้านขวา
- คงเครื่องมือแก้ไขหลายรายการเป็นสถานะปิดเริ่มต้น
- ตัดตัวนับรายการที่เลือกซ้ำภายในแผงเครื่องมือ
- แสดงปุ่มจัดการหมวดหมู่เฉพาะเมื่อเลือกแก้ไขหมวดหมู่
- เปลี่ยน เลือกทั้งหมด / ล้างการเลือก / ย้อนกลับล่าสุด เป็นคำสั่งรองแบบเบา
- คงราคา สต็อก หน่วย หมวดหมู่ สาขา การยืนยันผลกระทบ และ Undo ครบ
- ไม่เปลี่ยน Excel-like editing, resize, double-click autofit, scroll, draft หรือ validation

## Owner Correction — Bulk Scope

- เปลี่ยนหัวข้อเป็น “นำค่าไปใช้กับ”
- ใช้ Segmented Button Group สูง 38px เท่าช่องกรอก
- สถานะที่เลือกเป็นพื้นดำ ตัวอักษรขาว
- ปิดตัวเลือกเฉพาะรายการเมื่อยังไม่ได้ติ๊ก พร้อมคำแนะนำที่เข้าใจง่าย
- คง Modal ยืนยันก่อนใช้กับทุก 50 รายการ
- เพิ่มข้อความสรุปว่าค่าจะกระทบกี่รายการ
- ปุ่มตรวจสอบอยู่ต่อท้ายและสูงเท่ากับช่องกรอก
- แก้ Grid Baseline ให้ Label และ Control ทุกคอลัมน์อยู่ระดับเดียวกัน โดยแยก Helper text ออกจากความสูงของคอลัมน์

## Owner Correction — Secondary Utility Row

- ทำ `เลือกทั้งหมด` และ `ล้างการเลือก` เป็น Ghost Button Group พร้อม Icon
- ใช้ความสูง 34px และขนาดตัวอักษร 12px ตาม Dense Desktop control
- แสดง `ย้อนกลับการแก้ไขล่าสุด` เป็น Outline Button เฉพาะเมื่อมีคำสั่งให้ย้อนกลับจริง
- เพิ่ม Tooltip ด้านบนและ Accessible Name ให้ทุกปุ่มในแถบ
- ใช้ `--surface-subtle` ต่อเนื่องกับแผงเครื่องมือและเส้นคั่นด้านบน โดยไม่สร้างแถบพื้นขาวแยกชั้น
- ย้าย Success feedback ไปเป็น Toast ด้านบนกึ่งกลางและซ่อนอัตโนมัติใน 5 วินาที
- คง Error feedback ที่ต้องแก้ไว้ใกล้เครื่องมือ ไม่ซ่อนอัตโนมัติ

## Verification Gate

- TypeScript: PASS
- Scoped Rapid Entry UI tests: PASS 15/15
- Diff check: PASS
- Localhost: PASS
- Default collapsed state after reload: PASS
- Mouse open/close and category action: PASS
- Keyboard action selection: PASS
- Segmented scope mouse/keyboard and all-50 confirmation: PASS
- Secondary action Mouse/Keyboard, conditional Undo and top-center Toast: PASS
- Existing Browser Draft recovery: PASS

## Commit / Push

ไม่มี Commit และไม่มี Push จนกว่า Owner จะตรวจและอนุมัติ
