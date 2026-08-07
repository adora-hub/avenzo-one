# AVENZO ONE — Phase 1.0.3 Entitlement Enforcement

อัปเดตล่าสุด: 7 สิงหาคม 2026

## เป้าหมาย

ผูก Subscription ของแต่ละ Organization กับ Plan Version ที่ Active และใช้ค่า Feature ใน Version นั้นควบคุมการใช้งานจริงทั้งฐานข้อมูลและ UI โดยเริ่มจาก:

- `branches.enabled` — เปิดหรือปิดสิทธิ์สร้างสาขา
- `branches.max_count` — จำนวนสาขาสูงสุด

## สิ่งที่พัฒนาแล้ว

- เพิ่ม `organization_subscriptions.plan_version_id` แบบ nullable เพื่อไม่ทำให้ Subscription เดิมหยุดทำงาน
- เพิ่ม RPC `platform_set_organization_subscription_versioned` สำหรับ Platform Admin ที่ผ่าน AAL2
- เก็บ RPC เดิมไว้ระหว่างช่วงเปลี่ยนผ่าน ลดความเสี่ยงจากการ Deploy
- ตรวจว่า Version ต้องเป็น Active และต้องเป็น Version ของ Plan เดียวกับ Subscription
- Plan Version จะเปิดใช้งานไม่ได้ หากยังอ้าง Feature ที่ไม่ Active
- เพิ่ม Trigger ที่ตาราง `branches` เพื่อบังคับสิทธิ์และจำนวนสูงสุดจากฐานข้อมูล ป้องกันการข้าม UI/API
- ใช้ advisory transaction lock ป้องกันคำขอพร้อมกันสร้างสาขาเกินโควตา
- เพิ่ม View `organization_branch_entitlements` แบบ `security_invoker` สำหรับแสดง Plan Version, สถานะ, จำนวนที่ใช้, Limit และเหตุผลที่สร้างเพิ่มไม่ได้
- หน้า Platform Admin เลือกได้เฉพาะ Active Plan Version
- หน้า Organization แสดงสิทธิ์สาขาและปิดฟอร์มสร้างสาขาเมื่อ Subscription หมดอายุ, ปิด Feature หรือเต็มโควตา

## Compatibility Mode

Subscription เดิมที่ยังไม่มี `plan_version_id` แสดงสถานะ `legacy` และยังใช้สิทธิ์เดิมได้ จนกว่า Platform Admin จะกำหนด Active Plan Version ระบบจึงเริ่มบังคับ Entitlement ใหม่

## ผลการทดสอบ

- TypeScript `tsc --noEmit --incremental false` ผ่าน
- ทดสอบ Plan ที่จำกัด 3 สาขาใน Transaction: สาขาที่ 2 และ 3 ผ่าน ส่วนสาขาที่ 4 ถูกบล็อกด้วย `feature_branches_limit_reached`
- Rollback หลังทดสอบสำเร็จ: Feature และ Version ยังเป็น Draft, Subscription ยังไม่ถูกผูก Version และไม่มีสาขาทดลองค้าง
- Security Advisor ไม่พบคำเตือนใหม่จาก Schema Phase 1.0.3

## ขั้นตอนเปิดใช้กับ Organization จริง

1. เปิดใช้งาน Feature ที่ Plan Version อ้างอิง
2. ตรวจค่า Feature ใน Draft Plan Version
3. เปิดใช้งาน Plan Version ซึ่งหลังจากนั้นจะแก้ไขไม่ได้
4. ไปหน้า Platform Admin และ Provision/Adjust Subscription โดยเลือก Plan Version
5. ตรวจหน้า Organization ว่าแสดงจำนวนสาขาที่ใช้และ Limit ถูกต้อง

## Rollback

ไม่ควรถอด `plan_version_id` หรือ Trigger หากมี Organization ถูกผูก Version แล้ว การย้อนกลับต้องเริ่มจากหยุดการ Provision ใหม่ ตรวจ Subscription ที่อ้าง Version และวางแผนย้ายกลับ Compatibility Mode โดยเก็บ Subscription Event/Audit ไว้ครบถ้วน
