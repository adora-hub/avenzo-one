# AVENZO ONE — Phase 1.0.4.2 Subscription Lifecycle & History

อัปเดต: 7 สิงหาคม 2026

## เป้าหมาย

ให้ Platform Admin จัดการวงจร Subscription ได้ครบก่อนเชื่อม Payment Gateway พร้อมคำภาษาไทยที่ผู้ใช้งานเข้าใจง่าย ประวัติย้อนหลัง และการป้องกันคำสั่งซ้ำ

## สถานะบน UI

| ค่าระบบ | ข้อความภาษาไทย | วิธีได้สถานะ |
|---|---|---|
| `trial` | ช่วงทดลองใช้ฟรี | คำนวณจาก `metadata.trial_ends_at` |
| `active` | ใช้งานปกติ | ยังไม่ถึงวันหมดอายุ |
| `grace` | ช่วงผ่อนผัน | เลยวันหมดอายุแต่ยังไม่เลย Grace |
| `suspended` | พักการใช้งานชั่วคราว | สถานะที่บันทึกใน Subscription |
| `expired` | หมดอายุ | เลยวันสิ้นสุด Grace |
| `canceled` | ยกเลิกแล้ว | สถานะสิ้นสุดที่บันทึกใน Subscription |

`trial`, `grace` และ `expired` เป็นสถานะที่คำนวณจากเวลาจริง ส่วน `active`, `suspended` และ `canceled` เป็น Lifecycle ที่ฐานข้อมูลใช้ควบคุมรายการปัจจุบัน

## Action ภาษาไทย

- `provision` — เริ่ม Subscription
- `renew` — ต่ออายุ
- `adjust` — เปลี่ยนแพ็กเกจ/ปรับสิทธิ์
- `suspend` — พักการใช้งาน
- `resume` — เปิดใช้งานต่อ
- `cancel` — ยกเลิก

## Database Safety

- รองรับ Lifecycle `active`, `suspended`, `canceled`
- Unique Partial Index อนุญาต Subscription ปัจจุบันได้หนึ่งรายการต่อ Organization โดยนับทั้ง Active และ Suspended
- RPC `platform_transition_organization_subscription` ตรวจ State Transition ภายใน Transaction
- ใช้ Advisory Transaction Lock ป้องกันคำสั่งพร้อมกันของ Organization เดียวกัน
- ทุกคำสั่งมี UUID `command_id` และ Unique Index ป้องกัน Event ซ้ำเมื่อ Client Retry
- พัก/เปิดต่อ/ยกเลิกไม่สามารถเปลี่ยน Plan ไปพร้อมกัน
- Event Trigger เดิมสร้าง Organization Audit Log จาก Subscription Event อัตโนมัติ
- ถอนสิทธิ์ Authenticated ออกจาก RPC รุ่นเก่า เพื่อไม่ให้ข้ามกติกาใหม่

## UI

- การ์ด Subscription ปัจจุบัน แสดงสถานะภาษาไทย Plan Version วันสำคัญ และจำนวนสาขา
- Action Panel พร้อมเหตุผลและหน้าตรวจสอบก่อนยืนยัน
- ประวัติ Subscription เรียงล่าสุดก่อน มาตรฐาน 10 รายการต่อหน้า
- Pagination มี ก่อนหน้า ถัดไป เลขหน้า และช่องไปหน้าที่ต้องการ
- ฟอร์มเริ่ม Subscription ใหม่แสดงเฉพาะ Organization ที่ยังไม่มี Active/Suspended Subscription
- Dashboard และหน้า Workspace แสดงสถานะภาษาไทยจากแหล่งแปลเดียวกัน
- View `organization_subscription_status` คืนเพียงหนึ่งสถานะล่าสุดต่อ Organization และรองรับ Trial/Suspended/Canceled

## การทดสอบ

- TypeScript verification
- Security Advisor หลัง Migration
- Transaction test: `active → suspended → active` และ Rollback
- ยืนยันหลัง Rollback ว่าสถานะจริงยังเป็น Active และไม่มี Test Event ค้าง
- ตรวจ Status View บนฐานข้อมูลจริง: Organization ปัจจุบันแสดง `trial` ตามวันสิ้นสุดทดลอง
- Security Advisor ไม่มีคำเตือนใหม่จาก Migration (คำเตือน Leaked Password Protection เดิมยังคงอยู่ตามข้อจำกัดแพ็กเกจ)

## ขอบเขตที่ยังไม่รวม

- Payment Gateway และ Auto-renew
- Invoice, Receipt และภาษี
- Proration และ Credit Balance
- Email แจ้งเตือนก่อนหมดอายุ

## สถานะ

Implemented และผ่าน Database Transaction test; รอผู้ใช้ทดสอบ UI จริง
