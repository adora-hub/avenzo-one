# AVENZO ONE — Phase 1.2.2.2 Session Status & Activity Heartbeat

สถานะ: Implemented / รอผู้ใช้ทดสอบ Local

## เป้าหมาย

ตรวจสถานะ Session ปัจจุบันจากฝั่ง Server และเลื่อนเวลาหมดอายุจากการไม่ใช้งานเมื่อผู้ใช้ยังมี Activity โดยยังไม่บังคับ Logout ใน Phase นี้

## การทำงาน

- Component กลางทำงานทุกหน้า แต่จะเรียก RPC เฉพาะเมื่อ Browser มี Supabase Session
- ตรวจ Activity จากการ Focus, กดแป้นพิมพ์, กดหน้าจอ, Scroll และ Touch
- Browser จำกัดการเรียกไม่ถี่กว่า 60 วินาที และไม่ส่งเมื่อ Tab ถูกซ่อน
- Database จำกัดการเขียน `last_seen_at` และ `idle_expires_at` ไม่ถี่กว่า 60 วินาทีอีกชั้นหนึ่ง
- Absolute Timeout ไม่ถูกเลื่อน
- Session ที่หมดเวลา ถูกเพิกถอน หรือเป็นของผู้ใช้อื่นจะไม่ถูกชุบกลับมาใช้งาน
- ขั้นนี้บันทึกและรายงานสถานะเท่านั้น ยังไม่แสดงกล่องเตือนและยังไม่สั่งออกจากระบบ

## วิธีทดสอบ Local

1. เปิด `http://localhost:3000` แล้ว Login ด้วยบัญชี Owner/Staff หรือ Platform Admin
2. หากเป็น Platform Admin ให้กรอก TOTP ให้ผ่านตามปกติ
3. ใช้งานหน้าเว็บ เช่น คลิกปุ่มหรือเลื่อนหน้า แล้วรออย่างน้อย 60 วินาที
4. เปลี่ยนหน้าและใช้งานต่อ ต้องไม่เกิด Refresh เอง ไม่ถูก Logout และหน้าเว็บต้องทำงานปกติ
5. เปิด Browser Console ต้องไม่มีข้อความ `[session-activity] heartbeat failed`
6. ขั้นนี้ยังไม่แสดงเวลาคงเหลือหรือกล่องเตือน ซึ่งจะทำใน Phase ถัดไป

## ผลตรวจอัตโนมัติ

- `npm.cmd run test:session-activity-heartbeat`
- `npm.cmd run test:session-registration`
- `npm.cmd run test:session-policy-foundation`
- `npx.cmd tsc --noEmit --incremental false`
- `npm.cmd run build`
