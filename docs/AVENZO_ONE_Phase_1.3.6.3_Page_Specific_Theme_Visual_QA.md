# Phase 1.3.6.3 — Page-specific Theme Migration & Visual QA

วันที่: 13 สิงหาคม 2026

สถานะ: **Approved / Completed**

## เป้าหมาย

เก็บสีเฉพาะหน้าและสีสถานะธุรกิจที่ยังเป็นค่าตรง พร้อมตรวจ Visual QA ใน Light Mode และ Dark Mode โดยไม่เปลี่ยน Business Logic

## Button Contrast Gate

ตรวจปุ่มทุกชนิดบนพื้น Page, Card, Elevated Surface และ Status Surface โดยครอบคลุมสถานะต่อไปนี้

1. Primary, Secondary และ Danger ต้องมองเห็นขอบเขตปุ่มชัดเจน
2. Default, Hover, Active, Focus และ Disabled ต้องไม่กลืนกับพื้นหลัง
3. ข้อความและไอคอนต้องอ่านได้ชัดทั้ง Light Mode และ Dark Mode
4. Focus Ring ต้องมองเห็นได้โดยไม่พึ่งสีพื้นของปุ่มเพียงอย่างเดียว
5. ปุ่มเต็มความกว้างและปุ่มใน Card ต้องยังเห็นรูปทรงเมื่อสีพื้นปุ่มเท่ากับสี Card

## การแก้ไขรอบแรก

- เพิ่ม `--button-primary-border` และ `--button-primary-hover-border`
- เปลี่ยนพื้น Primary Button ใน Dark Mode เป็นสีน้ำเงิน `#2563eb` และ Hover `#3b82f6` เพื่อให้ตัดกับ Card อย่างชัดเจน
- กำหนด Dark Mode Border ให้ต่างจาก `--surface-background`
- เปลี่ยน `.button` จาก `border: 0` เป็น Semantic Border Token
- ครอบคลุมปุ่ม `ตรวจสอบก่อนเพิ่ม` ในหน้า Platform Admin Access และปุ่ม Primary ที่ใช้ Component กลางทั้งหมด
- เพิ่ม `test:dark-button-contrast` เป็น Regression Contract โดยบังคับ Contrast ระหว่างปุ่มกับ Card อย่างน้อย 3:1 และข้อความกับปุ่มอย่างน้อย 4.5:1
- เพิ่ม Cookie-backed server rendering ที่ Root Layout เพื่อคืนค่า Dark Mode ตั้งแต่ HTML แรกเมื่อ Refresh หรือเปิดหน้าใหม่ โดยไม่ใช้ inline script ใน Async Layout
- ให้ Theme Toggle เริ่ม state จากค่าที่บันทึกไว้ทันที ไม่ต้องรอเปิด Account Menu
- เพิ่ม `test:theme-persistence` ป้องกัน Regression ที่ F5 แล้วกลับเป็น Light Mode

## หน้าที่ต้องตรวจต่อ

- Platform Admin Access
- Plans และ Feature/Rule Actions
- Billing และ Billing Exceptions
- Transfer Proofs และ Approval Timeline
- Production Readiness
- Live Control

## เกณฑ์ปิด Phase

- ไม่พบพื้นสว่างผิด Theme หรือข้อความกลืนพื้น
- ปุ่มทุกสถานะผ่าน Button Contrast Gate
- Desktop, Tablet และ Mobile ผ่าน Visual QA
- TypeScript, Theme Contract Test และ Production Build ผ่าน

## ผลการอนุมัติปิด Phase

อนุมัติโดยเจ้าของระบบเมื่อวันที่ 13 สิงหาคม 2026 หลังตรวจหลักฐานดังนี้:

- Dark Button Contrast Contract: ผ่าน 3/3 tests
- Theme Persistence Contract: ผ่าน 2/2 tests
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Next.js Production Build: ผ่านครบ 37 หน้า โดยใช้ build directory แยกจาก Local Dev Server
- React review: ไม่พบปัญหา Component Structure, Hook Usage, Accessibility หรือ TypeScript Pattern ที่ขวางการอนุมัติ

ขั้นถัดไป: Phase 1.3.6.4 Operations UI Foundation ยังมีสถานะ Planned และต้องได้รับการอนุมัติเริ่มงานแยกต่างหาก
