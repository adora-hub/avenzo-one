# AVENZO ONE — Phase 1.2.4.1 Supabase Security Audit

วันที่ตรวจ: 11 สิงหาคม 2569

Supabase Project: `eigrllibviqjddenjuch`

ขอบเขต: ตรวจแบบอ่านอย่างเดียว ไม่แก้ Production, ไม่รัน Migration และไม่เปลี่ยนค่า Auth

## ผลสรุป

**ผ่านแบบมีเงื่อนไขสำหรับ Development และ Controlled Testing แต่ยังไม่ผ่าน Production Security Gate**

ฐานสำคัญของระบบอยู่ในสภาพดี: ตาราง `public` ทุกตารางเปิด RLS, ไม่พบ Policy สำหรับ `anon`, ไม่พบฟังก์ชัน `SECURITY DEFINER` ที่ให้ `anon` เรียกใช้, View ใช้ `security_invoker`, Storage หลักฐานการโอนเป็น Private และไม่พบ Secret ฝั่ง Server รั่วไปใน Browser Bundle หรือ Git

สิ่งที่ต้องปิดก่อน Production คือการจัดระเบียบสิทธิ์ฟังก์ชัน `SECURITY DEFINER`, ลด Table Grant ของ `anon`, แก้คำเตือน RLS Performance และตัดสินใจเรื่อง Leaked Password Protection ซึ่งหน้า Supabase ระบุว่าใช้ได้ตั้งแต่ Pro Plan

## หลักฐานที่ตรวจแล้ว

### 1. Database และ RLS

- ตารางใน `public` 49/49 ตารางเปิด RLS
- มี Policy 81 รายการ: `public` 79 รายการ และ `storage` 2 รายการ
- ไม่พบ Policy ที่ให้ Role `anon`
- ไม่พบ Update Policy ที่ขาด `WITH CHECK`
- Policy อ่าน Permission Catalog สำหรับ `authenticated` แบบทั้งตารางเป็นการเปิดโดยเจตนา เพราะเป็นข้อมูลรายการสิทธิ์ ไม่ใช่ข้อมูลลูกค้า
- ตารางใน `private` 5 ตารางเปิด RLS แต่ไม่มี Policy เป็นรูปแบบ deny-by-default ที่ตั้งใจใช้กับข้อมูล Session/Security ภายใน

### 2. Table Grants ที่ควรลด

Role `anon` ยังมี Table-level Grant บางส่วนบนตารางต่อไปนี้ แม้ RLS ปัจจุบันจะปิดกั้นแถวข้อมูลเพราะไม่มี Policy สำหรับ `anon`:

- `branches`
- `member_branches`
- `organization_members`
- `organizations`

สถานะ: **ยังไม่พบการอ่านข้อมูลข้ามสิทธิ์ แต่ควรถอน Grant ที่ไม่จำเป็นเพื่อลด Attack Surface** และต้องมี Regression Test ก่อนใช้ Migration

### 3. SECURITY DEFINER Functions

- ฟังก์ชันใน `public` 76 รายการ
- เป็น `SECURITY DEFINER` 56 รายการ
- มี 45 รายการที่ Role `authenticated` เรียกได้ จึงเกิด Security Advisor Warning
- ไม่พบรายการที่ `anon` เรียกได้
- ทุกฟังก์ชันกำหนด `search_path`
- ไม่พบการใช้ `user_metadata`, `raw_user_meta_data` หรือ `auth.role()` เพื่ออนุญาตสิทธิ์
- ฟังก์ชัน Platform/Billing สำคัญที่สุ่มตรวจ รวมถึง Review Queue, Fulfillment Queue, Policy, Sandbox และ Notification Health เรียก `private.is_platform_admin()` หรือ `private.is_platform_super_admin()` ซึ่งบังคับ Active Platform Admin และ AAL2/MFA

คำเตือนนี้จึง **ไม่ใช่หลักฐานว่าระบบถูกเจาะได้ทันที** แต่ต้องทำ Function Allowlist ให้ชัดเจน และถอน `EXECUTE` จาก `authenticated` สำหรับฟังก์ชันที่ใช้เฉพาะภายใน

### 4. View และ Storage

- View 2 รายการใช้ `security_invoker = true`
- View ไม่เปิดให้ `anon`
- Bucket `billing-transfer-proofs` เป็น Private
- จำกัดไฟล์ 5 MB
- MIME ที่อนุญาต: JPEG, PNG, WebP และ PDF

### 5. Authentication

- Site URL: `https://app.avenzoone.com`
- Redirect URL มีทั้ง Production callback และ `http://localhost:3000/auth/callback`
- Confirm Email เปิด
- Secure Email Change เปิด
- Secure Password Change เปิด
- Require Current Password ตอนเปลี่ยนรหัสเปิด
- Anonymous Sign-in ปิด
- Password ขั้นต่ำ 8 ตัว และบังคับตัวพิมพ์เล็ก ตัวพิมพ์ใหญ่ ตัวเลข และสัญลักษณ์
- Access Token อายุ 3,600 วินาที
- Refresh Token Reuse Detection เปิด ช่วงยอมรับการใช้ซ้ำ 10 วินาที
- Leaked Password Protection ยังปิด และหน้า Dashboard ระบุว่าใช้ได้ตั้งแต่ Pro Plan
- Supabase Free Plan ไม่เปิดการกำหนด Single Session, Time-box และ Inactivity Timeout จาก Dashboard แต่ AVENZO ONE มี App-level Session Policy จาก Phase 1.2 แล้ว

### 6. Secret และ Browser Boundary

- `SUPABASE_SECRET_KEY` พบเฉพาะ Server-only module และ Server API Route
- Browser Client ใช้เฉพาะ `NEXT_PUBLIC_SUPABASE_URL` และ Publishable Key
- ไม่พบ Secret Key แบบ `sb_secret_...` ถูก hard-code
- `.env` และ `.env.*` ถูก ignore; Git ติดตามเฉพาะ `.env.example`
- ไม่พบ `user_metadata` ถูกใช้เป็นแหล่งตัดสิน Authorization

### 7. Performance Advisor

- มีคำเตือน `auth_rls_initplan` 1 จุดที่ `public.billing_live_shadow_commands`
- มี Foreign Key ที่ยังไม่มี Index 16 จุด
- มีรายงาน Unused Index 97 จุด แต่ **ห้ามลบแบบเหมารวม** เพราะสถิติอาจยังไม่สะท้อน Production Workload

## ลำดับความเสี่ยงและงานแก้ไข

| ระดับ | รายการ | การตัดสินใจ |
|---|---|---|
| สูงก่อน Production | Leaked Password Protection ยังปิด | อัปเกรด Pro แล้วเปิด หรือบันทึกเป็น Production Blocker พร้อมมาตรการชดเชย |
| กลาง | 45 ฟังก์ชัน `SECURITY DEFINER` เรียกได้โดย `authenticated` | ทำ Function Allowlist และถอน `EXECUTE` ที่ไม่จำเป็น |
| กลาง | `anon` มี Table Grant บน 4 ตาราง | ถอน Grant หลัง Contract/Regression Test ยืนยันว่า Public Flow ไม่เสีย |
| กลาง | RLS InitPlan 1 จุด | ปรับ Policy ให้เรียก Auth Function ผ่าน scalar subquery และวัดผล |
| ต่ำ/Performance | Foreign Key ไม่มี Index 16 จุด | เพิ่มเฉพาะเส้นทาง Query ที่ใช้งานจริง |
| เฝ้าระวัง | Unused Index 97 จุด | เก็บข้อมูล Production ก่อนพิจารณา ไม่ลบทันที |

## Changelog ที่ต้องเตรียมรับ

- ตั้งแต่ 30 ตุลาคม 2569 โปรเจกต์เดิมจะถูกบังคับแนวทางการเปิดตารางใหม่ผ่าน Data API/GraphQL ด้วย Grant ที่ชัดเจนมากขึ้น จึงควรกำหนดมาตรฐาน `REVOKE/GRANT` ในทุก Migration ใหม่
- การ Pin Extension Version ถูกลดความสำคัญ/เลิกใช้ตั้งแต่ 5 สิงหาคม 2569 ควรตรวจ Compatibility ผ่าน Migration และ Regression Test แทนการพึ่ง Version Pin

## แผนถัดไปที่แนะนำ

1. **Phase 1.2.4.2.1 — Function Permission Allowlist**: จำแนก 45 ฟังก์ชันว่า Browser ต้องเรียกหรือเป็น Internal-only แล้วสร้าง Migration ถอน `EXECUTE` ที่เกินจำเป็น พร้อม Contract Test
2. **Phase 1.2.4.2.2 — Anonymous Grant Hardening**: ถอน Grant ของ `anon` บน 4 ตาราง พร้อมทดสอบ Login, Invitation และ Public Auth Flow
3. **Phase 1.2.4.2.3 — RLS/Index Performance Hardening**: แก้ InitPlan และเพิ่ม FK Index เฉพาะ Query Path สำคัญ
4. **Phase 1.2.4.2.4 — Production Password Gate**: เปิด Leaked Password Protection หลังอัปเกรด Pro แล้วรัน Security/Performance Advisor รอบปิดงาน

## สิ่งที่ไม่ได้ทำใน Phase นี้

- ไม่แก้ Database หรือ Auth Configuration
- ไม่ใช้ Migration กับ Supabase
- ไม่เปลี่ยน Environment Variable
- ไม่ Commit, Push หรือ Deploy
