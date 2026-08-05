# AVENZO ONE — Phase 0.2 Role/Permission Core

สถานะ: Completed / Deployed to Supabase

Supabase Project: `AVENZO ONE` (`eigrllibviqjddenjuch`)

Migration ที่ Deploy แล้ว:

- `phase_0_2_role_permission_core`
- `phase_0_2_harden_security`

## เป้าหมาย

สร้างระบบ RBAC สำหรับกำหนดสิทธิ์ผู้ใช้ภายใน Organization/Branch โดยเก็บ Authorization ในฐานข้อมูลและบังคับผ่าน Supabase RLS

## ขอบเขต

- Permission Catalog กลาง
- Role ต่อ Organization
- Role มาตรฐาน: `owner`, `admin`, `manager`, `staff`, `viewer`
- สมาชิกหนึ่งคนมีได้หลาย Role
- รองรับขอบเขต `organization` และ `branch`
- ป้องกันการแก้ไขสมาชิก/Role โดยผู้ไม่มีสิทธิ์
- Owner ถูกสร้างอัตโนมัติเมื่อสร้าง Organization ใหม่

## Permission หลัก

| Permission | ความหมาย |
|---|---|
| `organization.read` | ดูข้อมูล Organization |
| `organization.update` | แก้ไขข้อมูล Organization |
| `branch.read` | ดูสาขาตามขอบเขต |
| `branch.create` | สร้างสาขา |
| `branch.update` | แก้ไขสาขา |
| `member.read` | ดูสมาชิก |
| `member.invite` | เชิญสมาชิก |
| `member.update` | เปลี่ยนสถานะ/ขอบเขตสมาชิก |
| `role.read` | ดู Role และ Permission |
| `role.manage` | จัดการ Role และ Permission |

## ตารางใหม่

- `permissions`
- `organization_roles`
- `role_permissions`
- `member_roles`

## หลักความปลอดภัย

- RLS เปิดใช้งานทุกตารางใน `public`
- ไม่ใช้ `user_metadata` หรือข้อมูลจาก Client เป็นแหล่งตัดสินสิทธิ์
- ฟังก์ชัน `has_org_permission` เป็น `SECURITY DEFINER` และกำหนด `search_path` แบบตายตัว
- ไม่มี Hard Delete สำหรับ Organization/Branch/Member ใน Phase 0.2
- Permission ต้องตรวจทั้ง Organization และ Branch scope

## เกณฑ์เสร็จสิ้น

- [x] Migration ทำงานสำเร็จบน Supabase
- [x] สร้าง Organization ใหม่แล้วมี Owner/Role มาตรฐานผ่าน trigger
- [x] Admin จัดการสมาชิกและ Role ได้ผ่าน RLS Policy
- [x] Staff/Viewer ถูกจำกัดด้วย Organization/Branch Scope ผ่าน `has_org_permission`
- [x] Security Advisor ไม่พบปัญหา RLS ใหม่
- [ ] End-to-end test ด้วยบัญชี Auth จริง — รอเตรียม Test User ในขั้นถัดไป
- [x] Commit และ Push ขึ้น GitHub

## ข้อจำกัดที่ยังไม่รวม

- Platform Admin ที่จัดการ Suspend/Ban Organization
- Subscription และวันหมดอายุ
- UI สำหรับ Role Management
- Audit Log ของการเปลี่ยนสิทธิ์
