# AVENZO ONE — UI Mockup-First Implementation Guide V1

> คู่มือบังคับสำหรับงาน UI ทุกหน้า: ออกแบบและอนุมัติ Mockup ก่อน แล้วจึงนำไปใช้ในระบบจริงโดยยึด Mockup ที่อนุมัติเป็น Source of Truth

**เวอร์ชัน:** 1.0

**วันที่:** 15 สิงหาคม 2026

**สถานะ:** Owner Directive / Mandatory Repository Standard

**ใช้กับ:** หน้าใหม่, การออกแบบหน้าเดิมใหม่, Modal, Drawer, Form, Data Grid และ Interaction ที่ผู้ใช้มองเห็น

---

## 1. กฎหลักที่ห้ามข้าม

1. ทุกหน้าต้องมี Mockup ที่ทดลองใช้งานได้ก่อนเริ่ม Production UI
2. ต้องได้รับการอนุมัติ Mockup จากเจ้าของระบบก่อนนำไป Implement
3. Mockup เวอร์ชันที่อนุมัติเป็น **Page-level Source of Truth** สำหรับ Layout, Visual และ Interaction
4. Production implementation ต้องตรงกับ Mockup ที่อนุมัติ **100% ตามขอบเขตที่มองเห็นและใช้งานได้**
5. ผู้พัฒนาหรือ Codex ห้ามเปลี่ยนดีไซน์เองเพื่อให้เขียนโค้ดง่ายขึ้นหรือเพราะเห็นว่ารูปแบบอื่นดีกว่า
6. หากมีข้อจำกัดทางเทคนิค ต้องหยุด บันทึก Deviation Request และขออนุมัติก่อนแก้ดีไซน์
7. Backend, Security และ Domain Logic ที่ดีอยู่แล้วต้องรักษาไว้ การเปลี่ยน UI ไม่อนุญาตให้ลัด Command, RLS, Permission, Audit หรือ Inventory rules

กฎนี้มีผลเหนือข้อเสนอ UI เฉพาะหน้าที่ยังไม่ได้รับอนุมัติ หาก Mockup ขัดกับ Shared Component หรือ Design System ให้แจ้งข้อขัดแย้งและขอ Decision ก่อนแก้ทั้ง Mockup หรือมาตรฐานกลาง

---

## 2. Workflow และ Approval Gates

| Gate | งาน | หลักฐานที่ต้องมี | เริ่มขั้นถัดไปได้เมื่อ |
|---|---|---|---|
| UI-0 — Requirements | รวบรวมงานหลัก, ข้อมูล, State, Permission และ Viewport | Field/State inventory และขอบเขตหน้า | Owner ยืนยันขอบเขต |
| UI-1 — Mockup | สร้าง Standalone Mockup ที่กดทดลอง Interaction สำคัญได้ | ไฟล์ Mockup และรายการพฤติกรรม | พร้อมให้ตรวจ |
| UI-2 — Mockup Approval | ปรับทีละประเด็นจนผ่าน | เวอร์ชัน/วันที่/ภาพอ้างอิงและ Owner approval | **อนุมัติ Mockup แล้วเท่านั้น** |
| UI-3 — Implementation Mapping | จับคู่ส่วนใน Mockup กับ Component, Data และ Command จริง | Mockup-to-Production mapping | ไม่มีส่วนที่ตีความเอง |
| UI-4 — Production Implementation | แปลง Mockup เป็น React/Next.js และเชื่อมระบบจริง | Code โดยคง Visual/Interaction contract | Feature ทำงานครบ |
| UI-5 — Parity Verification | เทียบ Mockup กับระบบจริงทุก State/Viewport/Theme | Side-by-side หรือ Overlay, test results | ไม่มี Diff ที่ไม่ได้อนุมัติ |
| UI-6 — Production UI Approval | เจ้าของระบบตรวจระบบจริง | Final approval และรายการ Exception ที่อนุมัติ | จึงปิด Part และเริ่ม Part ถัดไป |

ห้ามใช้คำว่า “เสร็จ”, “Completed” หรือ “Local Gate Completed” หากผ่านเฉพาะ Backend/Test แต่ Visual Parity ยังไม่ผ่าน UI-5 และ UI-6

---

## 3. สิ่งที่ต้องตรงกับ Mockup 100%

- Page width, content gutters, grid, card hierarchy และตำแหน่งองค์ประกอบ
- Spacing, alignment, height, width, border, radius และ shadow
- Typography, ขนาดข้อความ, weight, line-height และข้อความที่แสดง
- สี, Semantic State, Light mode และ Dark mode
- Icon, badge, tooltip, combobox arrow และ icon-only action
- ลำดับและตำแหน่ง Button, Button group, Menu, Modal, Drawer และ Alert
- Data Grid: column order, default width, pinning, resizing, visible columns และ row density
- Interaction: click, hover, focus, keyboard shortcut, copy, inline edit, search และ validation
- Responsive behavior บน Desktop, Tablet และ Mobile
- Loading, Empty, Error, Success, Disabled, Permission และ Read-only state ที่เกี่ยวข้อง

Production สามารถใช้ Shared Component หรือโครงสร้างโค้ดภายในต่างจาก Standalone HTML ได้ แต่ผลลัพธ์ที่ผู้ใช้เห็นและพฤติกรรมที่ผู้ใช้สัมผัสต้องเหมือน Mockup ที่อนุมัติ

---

## 4. ความแตกต่างที่ทำได้โดยไม่ต้องเปลี่ยนดีไซน์

- ข้อมูลจริง เช่น ชื่อ, จำนวน, ราคา, ID และเวลา
- Implementation detail ที่ผู้ใช้มองไม่เห็น
- Accessibility attributes ที่ไม่เปลี่ยน Visual/Interaction contract
- Security, Permission, RLS, Audit และ Validation ฝั่ง Server
- Responsive wrapping ที่ Mockup ระบุไว้แล้ว

สิ่งต่อไปนี้ **ไม่ใช่** Implementation detail และต้องขออนุมัติก่อน:

- ย้ายหรือสลับลำดับ Section
- รวม/แยก Card หรือเปลี่ยน Form เป็น Modal/Drawer
- เปลี่ยนชนิด Component, ตำแหน่งปุ่ม, Label หรือวิธี Interaction
- ลดรายละเอียดเพราะเชื่อมข้อมูลจริงยาก
- เปลี่ยนระยะ, ความกว้าง หรือ Responsive behavior โดยไม่มี Mockup รองรับ
- เพิ่ม UI ใหม่ที่ผู้ใช้มองเห็น แม้ Backend ต้องการ State เพิ่ม

---

## 5. Deviation Request เมื่อทำตาม Mockup ไม่ได้

ต้องหยุดก่อนแก้ดีไซน์และบันทึก:

1. Mockup, เวอร์ชัน และ Element ที่ได้รับผลกระทบ
2. ข้อจำกัดพร้อมหลักฐานทางเทคนิค
3. ทางเลือกอย่างน้อยหนึ่งทางและผลกระทบ
4. ผลต่อ Desktop/Tablet/Mobile, Light/Dark, Accessibility และ Workflow
5. Mockup ฉบับแก้ไขหรือภาพเปรียบเทียบ
6. Owner approval ก่อนแก้ Production UI

หากยังไม่ได้อนุมัติ ให้สถานะเป็น `Blocked — Awaiting UI Decision` ห้ามเลือกทางออกเอง

---

## 6. Visual Parity Test Matrix

อย่างน้อยต้องตรวจ:

| มิติ | ค่าขั้นต่ำ |
|---|---|
| Viewport | Mobile 390px, Tablet 760px, Desktop 1280px และ 1920px หรือขนาดที่ Mockup กำหนด |
| Theme | Light และ Dark เมื่อระบบรองรับ |
| State | Default, Hover, Focus, Disabled, Loading, Empty, Error, Success, Permission/Read-only ตามที่เกี่ยวข้อง |
| Input | ข้อมูลปกติ, ข้อมูลยาว, ขอบเขตสูงสุด และ validation error |
| Interaction | Mouse, Keyboard, shortcut, menu/modal/drawer, submit/retry/cancel |
| Runtime | ไม่มี Console error, hydration error หรือ error overlay |

ให้ใช้ภาพ Side-by-side หรือ Overlay เปรียบเทียบ Mockup กับ Production และบันทึก Diff ทุกจุด การผ่าน TypeScript, Unit Test หรือ E2E ไม่สามารถทดแทน Owner visual approval ได้

---

## 7. Definition of Done สำหรับหน้า UI

- [ ] Requirements และ State inventory ได้รับการยืนยัน
- [ ] Mockup ทดลอง Interaction สำคัญได้
- [ ] Mockup มีเวอร์ชันและได้รับ Owner approval
- [ ] มี Mockup-to-Production mapping
- [ ] Production UI ตรง Mockup ทุกองค์ประกอบที่อยู่ในขอบเขต
- [ ] ไม่มี Design deviation ที่ไม่ได้รับอนุมัติ
- [ ] Light/Dark และ Responsive ผ่านตาม Matrix
- [ ] Loading/Empty/Error/Permission และ validation state ผ่าน
- [ ] Keyboard, Focus-visible และ Accessible Name ผ่าน
- [ ] Runtime, TypeScript และ Test ที่เกี่ยวข้องผ่าน
- [ ] Owner ตรวจ Production parity และอนุมัติ
- [ ] เอกสาร Phase/README แสดงสถานะจริง แยก Backend Complete ออกจาก UI Complete

---

## 8. กฎสถานะและลำดับงาน

- `Mockup In Review` — ยังแก้ Mockup ได้ แต่ห้ามเริ่ม Production UI
- `Mockup Approved / Design Frozen` — พร้อมทำ Implementation ห้ามเปลี่ยนดีไซน์เอง
- `Implementation In Progress` — เชื่อม Component/Data/Command แต่ยังไม่ถือว่า UI ผ่าน
- `Visual Parity Pending` — Function/Test อาจผ่านแล้ว แต่ยังมี Diff จาก Mockup
- `Owner Approved / Completed` — ผ่าน UI-5 และ UI-6 แล้วเท่านั้น

ถ้าพบว่า Part ที่เคยปิดยังไม่ตรง Mockup ให้ Reopen Part เดิมเพื่อแก้ Visual Parity และห้ามเริ่ม Part ถัดไปจนผ่าน

---

## 9. บันทึกการนำกฎมาใช้กับ Phase 2.1.R7.2

ณ วันที่ 15 สิงหาคม 2026:

- Backend/Form Integration, R7.1 Atomic command และ R6 image pipeline มี Implementation แล้ว
- Unified Product Creation production page เคยไม่ตรง Approved Mockup 100% จึงเปิด R7.2 ใหม่เป็น `Implementation In Progress / Visual Parity Pending`
- R7.2 ผ่าน Visual Parity Matrix และ Owner approval แล้ววันที่ 15 สิงหาคม 2026
- R7.3 เริ่มหลัง Gate ดังกล่าวและปิด AVENZO ONE PREVIEW E2E แล้ว โดย Production ไม่ถูกแตะ

---

## 10. บันทึก Products Workspace Interaction Parity Follow-up

วันที่ 16 สิงหาคม 2026 พบว่า Production Products มีรูปทรงหลักใกล้ Mockup แต่ Search, Excel Tools และ Customize Columns ยังทำงานและแสดงผลไม่ครบ Source of Truth จึง Reopen เฉพาะ Visible Interaction ตามกฎ Mockup-first และปิดตามลำดับ ไม่ทำพร้อมกัน:

1. Search และ Multi-code Search ตรงรูปแบบ/keyboard/URL-backed behavior ของ Mockup
2. Excel Tools เปิดใช้งานเมนู, Template CSV และ export-column preference; Import จำกัดเป็น Preview-only และไม่เขียนระบบจริง
3. Customize Columns ใช้ draft ก่อนบันทึก รองรับ show/hide, width, reorder, pin สูงสุด 3 และจำค่าหลัง F5
4. Authenticated browser ตรวจ Cancel, pin guard, save/persistence และคืนค่าเริ่มต้นหลังทดสอบ

หลักฐานปิดรอบ: Products regression 172/172, Product/SKU slice 3/3, TypeScript และ `git diff --check` ผ่าน ไม่มีการเพิ่ม Database write หรือเปลี่ยน Foundation/Inventory authority

---

## 11. เอกสารที่ต้องอ่านร่วมกัน

- `AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md`
- เอกสาร Phase/Part ของหน้าที่กำลังพัฒนา
- Approved Mockup และภาพอ้างอิงล่าสุดของหน้านั้น
- `AVENZO_ONE_Codex_Implementation_Starter_Plan_V7.md`
