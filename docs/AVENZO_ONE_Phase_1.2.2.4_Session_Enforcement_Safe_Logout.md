# Phase 1.2.2.4 — Session Enforcement & Safe Logout

## เป้าหมาย

บังคับออกจากระบบเมื่อ Session ไม่มีการใช้งานเกินกำหนด ครบอายุสูงสุด หรือถูกยกเลิก พร้อมพาผู้ใช้กลับหน้า Login อย่างปลอดภัย

## พฤติกรรม

- หน้าเว็บที่เปิดค้างตรวจเวลาจาก Server และออกจากระบบอัตโนมัติเมื่อหมดอายุ
- Middleware ตรวจสถานะ Session จาก Supabase ทุกครั้งที่เปิดหน้าป้องกัน
- ออกจากระบบเฉพาะ Session ของอุปกรณ์ปัจจุบัน (`scope: local`) ไม่กระทบอุปกรณ์อื่น
- ใช้การเปลี่ยนหน้าแบบ `replace` และกำหนด `private, no-store` เพื่อลดโอกาสกด Back แล้วเห็นหน้าป้องกันเดิม
- หน้า Login แสดงเหตุผลภาษาไทยแยก Idle Timeout, Absolute Timeout และ Session ถูกยกเลิก
- API ที่มี Session หมดอายุส่ง HTTP 401 พร้อมเหตุผลแบบ machine-readable

## ขอบเขตความปลอดภัย

- ไม่พึ่งตัวจับเวลาฝั่ง Browser เพียงอย่างเดียว
- ไม่เปิดเผย Secret Key ใน Browser
- Session ที่ยังไม่ถูกลงทะเบียนยังใช้งานได้เพื่อรองรับบัญชีเดิม และจะถูกลงทะเบียนจากขั้นตอน Login/Heartbeat
- ถ้าการล้าง Session ฝั่ง Client ล้มเหลว Middleware ยังปฏิเสธ Session ที่หมดอายุจากสถานะฐานข้อมูล

## การทดสอบ

1. Contract test ลำดับความสำคัญของเหตุผล Logout
2. ตรวจ Middleware ว่าตรวจ RPC, Logout แบบ local, ตอบ 401 และปิด cache
3. ตรวจ Client ว่า Logout เพียงครั้งเดียวและใช้ `location.replace`
4. ตรวจข้อความภาษาไทยหน้า Login
5. Regression tests ของ Session Policy, Registration, Heartbeat และ Warning UI
