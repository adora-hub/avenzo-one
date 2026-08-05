# AVENZO ONE Phase 0.1 — Organization & Branch Core

**สถานะ:** Completed / Deployed to Supabase  
**วันที่:** 5 สิงหาคม 2026  
**อ้างอิง:** `AVENZO_ONE_Codex_Implementation_Starter_Plan_V7.md`

**Supabase Project:** `AVENZO ONE` (`eigrllibviqjddenjuch`)  
**Region:** `ap-southeast-1`  
**Deployed migrations:** `phase_0_1_organization_branch_core`, `phase_0_1_harden_soft_delete`, `phase_0_1_tune_indexes_and_policies`

## 1. เป้าหมาย

วางแกนข้อมูลสำหรับ Multi-tenant โดยแยก Organization/ร้านค้า, Branch/สาขา และสมาชิกผู้ใช้งาน ให้พร้อมต่อยอดไปยัง Permission, RLS, Product, Warehouse และ Order

Phase นี้ยังไม่รวม Role/Permission แบบละเอียด, RLS Policy, Organization Suspension และ Subscription Expiry ซึ่งอยู่ใน Phase ถัดไป

## 2. ขอบเขต

- สร้าง Organization
- สร้างและจัดการ Branch ภายใน Organization
- เชื่อม User กับ Organization ผ่าน Membership
- รองรับ User เดียวอยู่ได้หลาย Organization
- รองรับ Membership ที่จำกัดเฉพาะ Branch หรือครอบคลุมทุก Branch
- สร้าง Active/Inactive lifecycle สำหรับ Organization และ Branch
- กำหนด Current Organization และ Current Branch เป็น Session Context
- ป้องกันการอ้างอิงข้อมูลข้าม Organization ใน Service/API layer

## 3. Data Model ขั้นต้น

### `users`

- `id` — primary key
- `email` หรือ external identity ตามระบบ Authentication ที่เลือก
- `display_name`
- `status`
- `created_at`, `updated_at`

### `organizations`

- `id` — primary key
- `name`
- `slug` — unique
- `status` — `active` หรือ `inactive`
- `timezone`
- `currency`
- `created_at`, `updated_at`

### `branches`

- `id` — primary key
- `organization_id` — foreign key ไปยัง `organizations`
- `code` — unique ภายใน Organization
- `name`
- `address` หรือข้อมูลที่อยู่ตามความจำเป็น
- `status` — `active` หรือ `inactive`
- `created_at`, `updated_at`

### `organization_members`

- `id` — primary key
- `organization_id`
- `user_id`
- `membership_status` — `invited`, `active`, `suspended`, `removed`
- `scope` — `organization` หรือ `branch`
- `created_at`, `updated_at`
- unique constraint: `organization_id + user_id`

### `member_branches`

- `membership_id`
- `branch_id`
- unique constraint: `membership_id + branch_id`

> ตารางธุรกิจในอนาคตต้องมี `organization_id` เป็น tenant key และเพิ่ม `branch_id` เมื่อข้อมูลมีขอบเขตระดับสาขา

## 4. กฎธุรกิจ

1. Organization ต้องมีสมาชิกเริ่มต้นอย่างน้อยหนึ่งคนเมื่อสร้างสำเร็จ
2. ผู้สร้าง Organization ได้ Membership เริ่มต้นเป็น `active`
3. Branch ต้องสังกัด Organization เดียว และห้ามย้ายข้าม Organization โดยตรง
4. `branch.code` ต้องไม่ซ้ำกันภายใน Organization เดียวกัน
5. Organization ที่ `inactive` ไม่สามารถสร้างข้อมูลธุรกรรมใหม่ได้
6. Branch ที่ `inactive` ไม่สามารถรับงานใหม่หรือถูกเลือกเป็น Current Branch ได้
7. การลบข้อมูลหลักให้ใช้ Soft Delete/Inactive เพื่อรักษา Audit และความสัมพันธ์ย้อนหลัง
8. Current Organization/Branch ต้องตรวจสอบจาก Membership ฝั่ง Server ทุกครั้ง
9. ห้ามรับ `organization_id` หรือ `branch_id` จาก Client แล้วเชื่อถือโดยไม่ตรวจสิทธิ์และความเป็นเจ้าของ

## 5. User Flow

```text
สร้าง Organization
→ สร้าง Membership ของผู้สร้าง
→ สร้าง Branch แรก (ถ้าธุรกิจต้องการ)
→ เลือก Organization
→ เลือก Branch หรือ All Branches ตาม Scope
→ เข้าใช้งานข้อมูลใน Context ที่ตรวจสอบแล้ว
```

## 6. API/Service ที่ต้องมี

- `createOrganization`
- `listMyOrganizations`
- `getOrganization`
- `updateOrganization`
- `createBranch`
- `listBranches`
- `getBranch`
- `updateBranch`
- `setCurrentOrganization`
- `setCurrentBranch`
- `getTenantContext`

ทุกคำสั่งต้องตรวจ Membership และตรวจว่า Branch อยู่ใน Organization เดียวกันก่อนเขียนข้อมูล

## 7. UI ที่ต้องส่งมอบ

- Organization Switcher ใน App Shell
- Branch Switcher ใน App Shell
- หน้า Organization Settings เบื้องต้น
- หน้า Branch List
- ฟอร์ม Create/Edit Organization
- ฟอร์ม Create/Edit Branch
- Empty State เมื่อยังไม่มี Branch
- Permission/Access Denied State สำหรับผู้ไม่มีสิทธิ์
- Loading และ Error State ของการโหลด/บันทึก

## 8. Acceptance Criteria

- [ ] สร้าง Organization ได้และสร้าง Membership ของผู้สร้างอัตโนมัติ
- [ ] User เดียวอยู่หลาย Organization ได้
- [ ] สร้าง Branch ภายใต้ Organization ได้
- [ ] Branch code ซ้ำใน Organization เดียวกันไม่ได้
- [ ] Branch จาก Organization อื่นถูกใช้แทนกันไม่ได้
- [ ] Inactive Organization/Branch ไม่ปรากฏเป็น Context ที่เลือกใช้งานได้
- [ ] การเปลี่ยน Current Context ตรวจสอบจาก Server
- [ ] API ไม่เชื่อถือ Tenant ID จาก Client โดยตรง
- [ ] ไม่มี Hard Delete สำหรับ Organization/Branch ที่มีความสัมพันธ์
- [ ] UI รองรับ Loading, Empty, Error และ Access Denied
- [ ] มี Test สำหรับ Cross-organization และ Cross-branch access

## 9. สิ่งที่ต้องตัดสินใจใน Phase ถัดไป

- Authentication Provider และรูปแบบ `users.id`
- Database/ORM ที่จะใช้จริง
- Role และ Permission Matrix
- RLS Strategy ของฐานข้อมูล
- กฎการเชิญสมาชิกและการอนุมัติ Membership
- การเลือก All Branches และข้อจำกัดของ Bulk Action
