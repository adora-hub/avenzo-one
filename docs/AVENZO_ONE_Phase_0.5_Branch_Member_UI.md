# AVENZO ONE — Phase 0.5 Branch & Member Management

สถานะ: Completed / Build Verified

## ขอบเขต

- หน้าจัดการ Workspace ต่อ Organization
- สร้าง Branch ภายใต้ Organization
- ดู Branch ที่ผู้ใช้มีสิทธิ์เข้าถึง
- ดูสมาชิกและ Membership Scope
- สร้างคำเชิญสมาชิกพร้อม Role และ Branch Scope
- หน้า `/organizations/[id]` สำหรับจัดการ Workspace

## Database

- `organization_invitations` เปิด RLS
- `create_organization_invitation(...)` ตรวจ `member.invite`, Role และ Branch ก่อนบันทึก
- คำเชิญมีอายุเริ่มต้น 7 วันและป้องกันคำเชิญซ้ำของอีเมลเดียวกันใน Organization

## ข้อจำกัด

- ขั้นนี้บันทึกคำเชิญในระบบก่อน ยังไม่ส่งอีเมลจริง
- การกดยอมรับคำเชิญและสร้าง Membership อัตโนมัติจะทำใน Auth/Invitation Flow ถัดไป
- การลบ Branch/สมาชิกยังใช้ Soft State ตามนโยบายเดิม
