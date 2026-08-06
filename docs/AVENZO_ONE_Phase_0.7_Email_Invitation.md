# AVENZO ONE — Phase 0.7 Email Invitation

สถานะ: Implemented / TypeScript Verified

## สิ่งที่เพิ่ม

- API ฝั่งเซิร์ฟเวอร์ `/api/invitations/send`
- สร้างคำเชิญผ่าน RPC ที่มี RLS เดิม
- ส่งคำเชิญผู้ใช้ใหม่ผ่าน Supabase Auth Admin API
- Redirect หลังยืนยันอีเมลกลับไปยังหน้ารับคำเชิญ
- ผู้ใช้ที่มีบัญชีอยู่แล้วได้รับลิงก์รับคำเชิญเป็นทางเลือก
- ไม่ส่ง Secret Key ไปยัง Browser และไม่เก็บ Secret Key ใน Repository
- Dashboard แสดง Role, Scope และสถานะสมาชิกของผู้ใช้ในแต่ละ Organization
- หน้า Workspace แสดงคำอธิบายตำแหน่งและ Permission ที่ผู้ใช้ได้รับจริง
- รองรับหลาย Role ต่อสมาชิกและ Branch Scope โดยอ่านข้อมูลผ่าน RPC ที่ผูกกับ `auth.uid()`

## การเปิดใช้งานอีเมลจริง

เพิ่มค่าใน `web/.env.local` เฉพาะเครื่องเซิร์ฟเวอร์:

```env
SUPABASE_SECRET_KEY=sb_secret_...
```

จากนั้นตั้งค่า Custom SMTP ใน Supabase Dashboard ที่ Authentication > SMTP เพื่อให้อีเมลส่งถึงผู้ใช้จริง สำหรับการทดสอบ Supabase SMTP เริ่มต้นจะส่งได้เฉพาะอีเมลที่ได้รับอนุญาตตามข้อจำกัดของ Supabase

หลังแก้ `.env.local` ต้อง restart `npm.cmd run dev` ก่อนทดสอบ
