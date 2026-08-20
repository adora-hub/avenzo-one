# AVENZO ONE — Phase T4.2A Remote Schema Reconciliation Plan

**สถานะ:** Prepared — Pending Owner Environment Approval; Not Executed  
**วันที่:** 20 สิงหาคม 2026  
**Parent Plan:** `docs/AVENZO_ONE_Phase_T4_2_Permission_RLS_Constraints_Plan.md` — Approved Plan, Pending Pre-Implementation Gates  
**Source of Truth:** `docs/AVENZO_ONE_Phase_T_Initial_Stock_Integration.md`  
**ขอบเขต:** Remote schema reconciliation แบบ SELECT-only สำหรับ Foundation และ T4 metadata เท่านั้น  
**ข้อห้าม:** ห้ามเชื่อม Remote ก่อน Owner อนุมัติ Environment; ห้ามอ่าน PII/Secret/Domain rows; ห้าม DDL/DML, Migration, RPC, API, Test Code, Commit หรือ Push

---

## 1. Objective

ตรวจว่า Remote schema สอดคล้องกับ tracked migrations และ T4.1/T4.2 contract ก่อนออกแบบ implementation จริง โดยตอบเฉพาะคำถามต่อไปนี้:

- Foundation objects และ permission helper ที่ T4 จะพึ่งพามีจริงและมี definition ตรงหรือไม่
- มี object ชื่อชนกับ Product/SKU/Warehouse/Location/Batch/Movement หรือไม่
- Existing constraints, indexes, RLS, grants, functions และ triggers รองรับ tenant/branch isolation หรือมี conflict ใด
- Remote migration identifiers ตรงกับ repository หรือมี drift

T4.2A ไม่ตรวจความถูกต้องของข้อมูลธุรกิจ ไม่อ่าน row data และไม่เปลี่ยน Remote state

---

## 2. Environment Decision

| Environment | Decision | Rationale | Authorization Requirement |
|---|---|---|---|
| **Preview** | **Recommended first** | ลดความเสี่ยงต่อ Production และเหมาะกับ schema drift discovery | Owner ต้องระบุชื่อ/รหัส Environment และอนุมัติ read-only access path |
| Production | Not selected | Metadata ยังอาจเปิดเผยโครงสร้างระบบจริง และความผิดพลาดด้านสิทธิ์มีผลกระทบสูงกว่า | ใช้ได้เฉพาะเมื่อ Owner ระบุ Production อย่างชัดเจน; ห้าม infer จากการไม่มี Preview |

**Current environment state:** ไม่มี Environment ใดได้รับอนุมัติ และยังไม่เชื่อม Remote

Rules:

1. Owner ต้องตอบเป็นลายลักษณ์อักษรว่าอนุญาต **Preview** หรือ **Production**
2. หาก Owner อนุมัติ Preview ให้ตรวจเฉพาะ Preview; ห้ามตรวจ Production ต่อเนื่องโดยอัตโนมัติ
3. หากไม่มี Preview ให้หยุดและขอ Owner ตัดสินใจใหม่
4. ห้ามส่ง Database password, service role key, access token หรือ connection string ในแชท/รายงาน
5. ใช้ authenticated integration หรือ read-only credential ที่ Platform Owner จัดเตรียมไว้นอกเอกสารนี้เท่านั้น

---

## 3. Execution Guardrails

- Connection principal ต้องมีสิทธิ์อ่าน system catalog เท่าที่จำเป็นและไม่มีสิทธิ์เขียน schema/data
- เริ่มด้วย read-only transaction guard และจบด้วย rollback; statement ที่ตรวจ metadata ต้องเป็น `SELECT` เท่านั้น
- จำกัด schema/object ด้วย allowlist; ห้ามใช้ broad data export หรือ `SELECT *` จาก Domain/Auth tables
- ห้าม invoke stored procedure, trigger function, RPC หรือ application function แม้ชื่อสื่อว่า read-only
- Catalog helper เช่น `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_triggerdef` และ `pg_get_function_identity_arguments` ใช้เพื่อ render metadata เท่านั้น ไม่ได้ execute target function
- ห้าม query `pg_stat_activity.query`, logs, query history, Vault, secrets หรือ environment configuration
- เก็บผลเฉพาะ object metadata ที่จำเป็น; redact project/database identifier ใน report หาก Owner กำหนด
- หาก query ใดต้องใช้สิทธิ์เกิน read-only หรือผลลัพธ์อาจมี PII/Secret ให้ classify เป็น `unknown` และหยุด query นั้น
- ห้ามใช้ `supabase db pull`, `db push`, migration repair/apply, dashboard mutation หรือ advisor auto-fix

Transaction wrapper ที่อนุญาตเมื่อ access path รองรับ:

```sql
begin transaction read only;
-- Execute only the approved SELECT statements in Section 5.
rollback;
```

---

## 4. Object Scope Allowlist

### 4.1 Schemas

- `public`: Foundation และ candidate T4 objects
- `private`: permission/audit helper metadata เฉพาะ object ที่เกี่ยวข้อง
- `supabase_migrations`: migration identifier metadata เท่านั้น
- `auth`: ตรวจได้เฉพาะ existence/signature ของ FK target ที่จำเป็น; ห้ามอ่าน row หรือ user identity

### 4.2 Foundation Objects

- `organizations`
- `branches`
- `organization_members`
- `member_branches`
- `permissions`
- role/permission assignment tables ที่ tracked migrations ใช้อยู่
- `private.has_org_permission` และ helper ที่ T4 ต้องเรียกโดยตรง

### 4.3 T4 Candidate Objects

- `products`
- `skus`
- `warehouses`
- `inventory_locations`
- `inventory_receive_batches`
- `inventory_receive_batch_items`
- `inventory_movements`
- idempotency/audit/read-model objects ที่ชื่อหรือ dependency เกี่ยวข้องกับ T4

Object นอก allowlist ตรวจได้เฉพาะเมื่อจำเป็นเพื่ออธิบาย dependency โดยต้องเพิ่มเหตุผลใน Drift Report ก่อน

---

## 5. Metadata Query Allowlist

Query ต่อไปนี้เป็น draft allowlist และ **ยังไม่ถูก execute** ต้องแทนค่า schema/object filter ด้วย allowlist ใน Section 4 เท่านั้น

### Q01 — Environment Fingerprint และ Read-only State

```sql
select
  current_database() as database_name,
  current_setting('server_version') as server_version,
  current_setting('transaction_read_only') as transaction_read_only;
```

ผลลัพธ์ห้ามรวม hostname, connection string, username, password หรือ token

### Q02 — Schema Existence

```sql
select n.nspname as schema_name
from pg_catalog.pg_namespace n
where n.nspname in ('public', 'private', 'supabase_migrations', 'auth')
order by n.nspname;
```

### Q03 — Table/View/Object Inventory

```sql
select n.nspname as schema_name, c.relname as object_name, c.relkind
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private')
  and c.relname = any (array[
    'organizations', 'branches', 'organization_members', 'member_branches',
    'permissions', 'products', 'skus', 'warehouses', 'inventory_locations',
    'inventory_receive_batches', 'inventory_receive_batch_items',
    'inventory_movements'
  ])
order by n.nspname, c.relname;
```

### Q04 — Column Contract Metadata

```sql
select table_schema, table_name, ordinal_position, column_name,
       data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema in ('public', 'private')
  and table_name = any (array[
    'organizations', 'branches', 'organization_members', 'member_branches',
    'permissions', 'products', 'skus', 'warehouses', 'inventory_locations',
    'inventory_receive_batches', 'inventory_receive_batch_items',
    'inventory_movements'
  ])
order by table_schema, table_name, ordinal_position;
```

อ่านเฉพาะ column definition; หาก default expression มีข้อความคล้าย Secret ให้ redact value และ classify `unknown`

### Q05 — PK/FK/Unique/Check Constraints

```sql
select n.nspname as schema_name, c.relname as table_name,
       con.conname as constraint_name, con.contype,
       pg_catalog.pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private')
  and c.relname = any (array[
    'organizations', 'branches', 'organization_members', 'member_branches',
    'permissions', 'products', 'skus', 'warehouses', 'inventory_locations',
    'inventory_receive_batches', 'inventory_receive_batch_items',
    'inventory_movements'
  ])
order by n.nspname, c.relname, con.conname;
```

### Q06 — Index Definitions

```sql
select schemaname, tablename, indexname, indexdef
from pg_catalog.pg_indexes
where schemaname in ('public', 'private')
  and tablename = any (array[
    'organizations', 'branches', 'organization_members', 'member_branches',
    'permissions', 'products', 'skus', 'warehouses', 'inventory_locations',
    'inventory_receive_batches', 'inventory_receive_batch_items',
    'inventory_movements'
  ])
order by schemaname, tablename, indexname;
```

### Q07 — RLS Enable/Force Flags

```sql
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private')
  and c.relkind in ('r', 'p')
  and c.relname = any (array[
    'organizations', 'branches', 'organization_members', 'member_branches',
    'permissions', 'products', 'skus', 'warehouses', 'inventory_locations',
    'inventory_receive_batches', 'inventory_receive_batch_items',
    'inventory_movements'
  ])
order by n.nspname, c.relname;
```

### Q08 — RLS Policy Metadata

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname in ('public', 'private')
  and tablename = any (array[
    'organizations', 'branches', 'organization_members', 'member_branches',
    'permissions', 'products', 'skus', 'warehouses', 'inventory_locations',
    'inventory_receive_batches', 'inventory_receive_batch_items',
    'inventory_movements'
  ])
order by schemaname, tablename, policyname;
```

Policy expression เป็น schema metadata; ห้ามใช้ผลเพื่อค้น row ที่ policy อ้างถึง

### Q09 — Table/View Grants

```sql
select grantor, grantee, table_schema, table_name, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema in ('public', 'private')
  and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  and table_name = any (array[
    'organizations', 'branches', 'organization_members', 'member_branches',
    'permissions', 'products', 'skus', 'warehouses', 'inventory_locations',
    'inventory_receive_batches', 'inventory_receive_batch_items',
    'inventory_movements'
  ])
order by table_schema, table_name, grantee, privilege_type;
```

### Q10 — Relevant Function Security Metadata

```sql
select n.nspname as schema_name, p.proname as function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
       p.prosecdef as security_definer,
       p.provolatile as volatility,
       p.proconfig as function_config,
       p.proacl as access_control_list
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and p.proname in ('has_org_permission')
order by n.nspname, p.proname, identity_arguments;
```

ห้าม select `prosrc`, ห้ามอ่าน function body และห้าม invoke function

### Q11 — Relevant Trigger Metadata

```sql
select n.nspname as schema_name, c.relname as table_name,
       t.tgname as trigger_name,
       pg_catalog.pg_get_triggerdef(t.oid, true) as definition
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname in ('public', 'private')
  and c.relname = any (array[
    'organizations', 'branches', 'organization_members', 'member_branches',
    'permissions', 'products', 'skus', 'warehouses', 'inventory_locations',
    'inventory_receive_batches', 'inventory_receive_batch_items',
    'inventory_movements'
  ])
order by n.nspname, c.relname, t.tgname;
```

### Q12 — Routine Grants

```sql
select grantor, grantee, specific_schema, routine_name, privilege_type, is_grantable
from information_schema.role_routine_grants
where specific_schema in ('public', 'private')
  and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  and routine_name in ('has_org_permission')
order by specific_schema, routine_name, grantee, privilege_type;
```

### Q13 — Migration Identifier Reconciliation

ก่อน query ให้ยืนยันด้วย Q03-equivalent ว่า `supabase_migrations.schema_migrations` มีอยู่จริง จากนั้นอ่านเฉพาะ identifier columns ที่มีอยู่ เช่น:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

ห้าม select migration SQL body, statement payload หรือข้อมูล credential; หากไม่มี column `name` ให้เลือกเฉพาะ `version`

### Q14 — Installed Extension Names/Versions

```sql
select e.extname as extension_name, e.extversion as extension_version,
       n.nspname as schema_name
from pg_catalog.pg_extension e
join pg_catalog.pg_namespace n on n.oid = e.extnamespace
order by e.extname;
```

ใช้เพื่ออธิบาย type/function dependency เท่านั้น ไม่เปลี่ยน extension

---

## 6. Explicitly Forbidden Queries and Data

- `select *` หรือ column-level select จาก `auth.users`, profiles, customers, contacts, orders, products, SKUs, stock, movements หรือ Domain table rows
- Email, phone, address, name, external identity, customer reference, free-text note หรือ actor payload
- Vault/Secret tables, environment variables, API keys, JWT, session/token, password hash หรือ connection string
- `pg_stat_activity.query`, statement logs, audit payloads หรือ request/response bodies
- Storage object names/content หากอาจระบุตัวบุคคลหรือข้อมูลธุรกิจ
- Function source body (`pg_proc.prosrc`) หรือการ execute function/RPC
- Any `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, `CREATE`, `ALTER`, `DROP`, `GRANT`, `REVOKE`, `COMMENT`, migration command หรือ advisor fix

หาก metadata result มี identifier ที่ดูเป็น PII/Secret โดยไม่คาดคิด ให้หยุด เก็บเฉพาะ query ID และ classification `unknown-sensitive` โดยไม่คัดลอก value ลงรายงาน

---

## 7. Reconciliation Checks

### 7.1 Foundation

- Branch มี unique key `(id, organization_id)` สำหรับ Warehouse composite FK หรือไม่
- Membership/Branch assignment tables มี constraints/indexes รองรับ RLS lookup หรือไม่
- `private.has_org_permission` เป็น SECURITY DEFINER หรือไม่, fixed `search_path` หรือไม่ และ execute grants แคบพอหรือไม่
- Public/Private grants ไม่มี broad write หรือ PUBLIC execute ที่ขัดกับ T4.2 หรือไม่

### 7.2 T4 Name/Definition Conflicts

- Candidate table/view/function/enum/type ชนชื่อกับ T4 contract หรือไม่
- Existing Product/SKU/Warehouse/Location objects มี tenant/branch columns, key types และ delete behavior ตรงหรือไม่
- Existing inventory object เป็น mutable balance tableหรือ append-only movement ledger
- Existing idempotency object มี scope/key/hash/result/status semantics ที่ใช้ซ้ำได้หรือขัด contract

### 7.3 Security

- Exposed tables Enable RLS และ policies target `authenticated` พร้อม permission/tenant/branch predicates
- Browser roles ไม่มี direct Batch/Item/Movement write grants
- View behavior ไม่ bypass underlying RLS โดยไม่ตั้งใจ
- SECURITY DEFINER function อยู่นอก exposed schemaหรือมี guard/search_path/grants ครบ

### 7.4 Performance/Integrity

- FK และ RLS filter columns มี supporting indexes
- Composite keys ไม่เปิดช่อง cross-tenant/cross-branch reference
- Movement UPDATE/DELETE ถูกปฏิเสธหลายชั้นหรือยังขาด immutability guard

---

## 8. Output Classification

ทุก check ต้องจัดเป็นหนึ่งสถานะ:

| Status | Meaning | Required Action |
|---|---|---|
| `match` | Remote ตรง tracked migration/approved contract | บันทึก evidence metadata |
| `missing` | Object/constraint/policy ที่ต้องมีไม่มีใน Remote | เสนอ implementation item ภายหลัง PM อนุมัติ |
| `extra` | Remote มี object ที่ Git/contract ไม่กล่าวถึงแต่ไม่ชนโดยตรง | ระบุ owner และเหตุผลก่อนตัดสินใจ |
| `conflict` | ชื่อ/definition/security behavior ขัดกับ contract | Stop; ส่ง PM decision ห้ามออก Migration |
| `unknown` | สิทธิ์ไม่พอหรือ query ถูกห้ามเพื่อความปลอดภัย | Stop เฉพาะ check นั้น; ห้ามขยายสิทธิ์เอง |
| `unknown-sensitive` | Metadata อาจเปิดเผย PII/Secret | ไม่บันทึก value; แจ้ง Owner เพื่อกำหนดวิธีตรวจใหม่ |

Drift Report ต้องระบุ Environment, timestamp, query IDs, object identifiers ที่จำเป็น และ classification เท่านั้น ไม่แนบ raw dump

---

## 9. Stop Conditions

หยุดทันทีเมื่อ:

- Environment ที่ connection ชี้ไม่ตรงกับ Owner approval
- Read-only state ยืนยันไม่ได้หรือ principal มี write capability ที่หลีกเลี่ยงไม่ได้
- Query ต้องอ่าน PII/Secret/Domain rows เพื่อให้คำตอบ
- พบ `conflict` ที่มีผลต่อ key type, tenant boundary, branch scope, RLS, grants หรือ migration history
- พบชื่อ object/definition ที่ต้องตีความเกิน contract เดิม
- Tool ขอ migration apply, schema write, credential disclosure หรือ broadened permission

ห้ามแก้ conflict ใน T4.2A ให้บันทึกและส่ง PM/Owner ตัดสินใจเท่านั้น

---

## 10. Owner Approval Request

ก่อนเริ่ม execution ต้องได้รับคำตอบครบ:

1. อนุญาต Environment: **Preview (แนะนำ)** หรือ **Production**
2. ยืนยัน exact project/environment identifier ผ่านช่องทางที่ไม่เปิด Secret
3. อนุมัติ authenticated read-only access path
4. อนุมัติ Q01–Q14 และ no-PII/no-Secret boundary
5. ระบุผู้รับ Drift Report และผู้ตัดสินใจเมื่อพบ `conflict`/`unknown`

**สถานะสุดท้าย:** Prepared only — ไม่มี Remote Connection และไม่มี Query ถูก execute; หยุดรอ Owner Environment Approval


