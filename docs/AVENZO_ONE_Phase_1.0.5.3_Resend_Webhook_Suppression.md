# AVENZO ONE — Phase 1.0.5.3 Resend Webhook & Suppression

อัปเดต: 8 สิงหาคม 2026

## เป้าหมาย

รับสถานะหลังส่งจาก Resend อย่างปลอดภัย เพื่อแยกให้ออกว่า Resend เพียงรับคำขอส่ง หรืออีเมลส่งถึงเซิร์ฟเวอร์ผู้รับแล้ว รวมทั้งหยุดส่งอัตโนมัติเมื่ออีเมลตีกลับ ผู้รับแจ้งสแปม หรือ Resend ระงับผู้รับ

## สถานะภาษาไทย

- `sent` — Resend รับคำขอแล้ว
- `delivery_delayed` — การส่งล่าช้า
- `delivered` — ส่งถึงเซิร์ฟเวอร์ผู้รับแล้ว
- `failed` — ผู้ให้บริการส่งไม่สำเร็จ
- `bounced` — อีเมลตีกลับ
- `complained` — ผู้รับแจ้งว่าเป็นสแปม
- `suppressed` — Resend ระงับการส่ง

## ความปลอดภัยและความเป็นส่วนตัว

- Route `/api/webhooks/resend` อ่าน Raw Body และตรวจ `svix-id`, `svix-timestamp`, `svix-signature` ด้วย Signing Secret ก่อนประมวลผล
- ใช้ `svix-id` เป็น Unique Event ID จึงรองรับ At-least-once Delivery โดยไม่บันทึก Event ซ้ำ
- รองรับ Event ที่มาไม่เรียงลำดับ โดยสถานะรุนแรงกว่าจะไม่ถูกสถานะเก่าทับกลับ
- RPC สำหรับ Webhook และ Worker เรียกได้เฉพาะ `service_role`
- ตารางใหม่เปิด RLS และ Platform Admin ต้องผ่าน MFA AAL2 จึงอ่านได้
- ไม่บันทึก From, To, Subject หรือสำเนาอีเมลผู้รับใน Webhook Log
- Suppression เชื่อมด้วย Supabase User ID เท่านั้น

## การหยุดส่งอัตโนมัติ

- เมื่อได้รับ `bounced`, `complained` หรือ `suppressed` ระบบสร้างหรืออัปเดต Suppression ของผู้รับ
- คิว Pending/Failed ของผู้รับจะถูกยกเลิกทันที
- Worker ตรวจ Suppression อีกครั้งหลัง Claim และก่อนอ่านอีเมลจาก Supabase Auth
- Delivery ที่ถูกหยุดก่อนส่งบันทึกผลเป็น `suppressed`

## Environment Variable

```env
RESEND_WEBHOOK_SECRET=whsec_xxx
```

Signing Secret ต้องคัดลอกจาก Webhook Endpoint ใน Resend และเก็บเป็น Server-only Secret ห้ามใช้ชื่อขึ้นต้น `NEXT_PUBLIC_`

## Production Setup ที่ต้องทำหลัง Deploy

1. Deploy แอปให้มี HTTPS URL สาธารณะ
2. สร้าง Resend Webhook ไปที่ `https://<production-domain>/api/webhooks/resend`
3. เลือก Event: Sent, Delivery Delayed, Delivered, Failed, Bounced, Complained และ Suppressed
4. คัดลอก Signing Secret ไปตั้งเป็น `RESEND_WEBHOOK_SECRET` ใน Production Environment
5. ส่งอีเมลทดสอบและยืนยันว่า Event ปรากฏในหน้า Platform Admin

ไม่ควรตั้ง Resend Webhook ไปที่ `localhost` เพราะ Resend เข้าถึงเครื่องภายในไม่ได้

## ผลการทดสอบ

- Migration ใช้งานบน Supabase สำเร็จ
- Event เดิมถูกบันทึกเพียง 1 ครั้งเมื่อส่งซ้ำด้วย `svix-id` เดิม
- Event `sent` ที่มาทีหลังไม่ลดสถานะจาก `delivered` กลับเป็นสถานะเก่า
- Event `bounced` สร้าง Suppression ได้ และการทดสอบฐานข้อมูลใช้ Transaction/rollback
- Route ที่ไม่มีลายเซ็นตอบ `400`
- Route ที่มีลายเซ็นถูกต้องตอบ `200`; ส่งซ้ำแล้วตอบว่าเป็น Duplicate
- ลบ Webhook Event จำลองหลังทดสอบแล้ว ไม่มีข้อมูลทดสอบค้าง
- TypeScript และ Production Build ผ่าน
- Security Advisor ไม่พบคำเตือนใหม่จาก Phase นี้; ยังเหลือคำเตือนเดิมเรื่อง Leaked Password Protection ซึ่งต้องใช้ Supabase Pro
- Production dependency audit พบคำเตือน High 3 รายการจากสาย dependency ของ Next.js/PostCSS/Sharp; แนวทางแก้อัตโนมัติต้องอัปเกรด Next.js ข้าม Major จึงแยกตรวจ compatibility ก่อน ไม่ใช้ `audit fix --force`

## สถานะ

Implemented และทดสอบ Local Signed Webhook สำเร็จแล้ว; เหลือ Deploy Production URL และลงทะเบียน Webhook Endpoint จริงใน Resend
