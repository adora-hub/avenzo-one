# Phase 2.1.R6 — Product Image Gate

สถานะ: Owner Approved / Local Gate Completed — 15 สิงหาคม 2026

## Outcome

R6 เพิ่มสัญญาภาพสินค้าแบบ additive โดยไม่เริ่ม Unified Product Creation (R7) และไม่ apply Supabase Production:

- private bucket `product-images`
- Product หนึ่งรายการมีภาพสถานะใช้งาน/กำลังอัปโหลดรวมไม่เกิน 9 ภาพ
- จำกัดไฟล์ 5 MiB และรับเฉพาะ JPEG, PNG, WebP; ไม่รับ SVG/GIF/PDF
- path ถาวรแบบ `{organization_id}/{product_id}/{image_id}.{ext}` และห้าม overwrite
- รองรับลำดับ 1–9, ภาพปกเพียงหนึ่งภาพ, alt text และ lifecycle `uploading → ready/failed → archived`
- browser อัปโหลดได้เฉพาะ path ที่ trusted command จองให้ผู้ใช้คนนั้น และอ่านไฟล์ได้เฉพาะภาพ `ready` ที่มี `product.read`
- metadata, command, event และ audit เขียนผ่าน trusted idempotent command เท่านั้น
- ไฟล์จริงอัปโหลด/ลบผ่าน Supabase Storage API; application ไม่แก้ `storage.objects` โดยตรง

## Upload and compensation contract

1. `product.image.prepare` ตรวจ Product, permission, MIME, ขนาด และจำนวน จากนั้นคืน path แบบใช้ครั้งเดียวพร้อม `upsert: false`.
2. Browser ใช้ Storage API อัปโหลดตรงไปยัง private bucket โดย RLS ตรวจ reservation และ `auth.uid()`.
3. `product.image.finalize` อ่าน Storage metadata เพื่อตรวจ MIME/size ก่อนเปลี่ยนเป็น `ready`; ภาพแรกเป็น cover อัตโนมัติ.
4. หาก upload ไม่สำเร็จ ใช้ `product.image.fail` หลังยืนยันว่าไม่มี object.
5. หาก upload สำเร็จแต่ finalize ล้มเหลว server ลบ object ผ่าน Storage API ก่อนสั่ง fail; หาก DB transition ล้มเหลวให้ retry transition เดิมได้.
6. การ archive ลบ object ผ่าน Storage API ก่อน แล้วจึง archive metadata; ถ้าภาพปกถูก archive ระบบเลือกภาพ `ready` ลำดับแรกเป็น cover.
7. `product.images.reorder` ต้องส่งภาพ `ready` ทั้งชุด 1–9 รายการ ไม่มี ID ซ้ำ และ cover ต้องอยู่ในชุดเดียวกัน.

## Read model and UI

- `ProductWorkspaceRow.coverImage` ใช้ batch query ไม่มี N+1.
- `ProductWorkspaceDetail.images` เรียงตาม `sortOrder` และจำกัดสูงสุด 9 ภาพ.
- Server สร้าง signed URL อายุ 600 วินาที; row ที่ลงนามไม่สำเร็จกลับไปใช้ neutral placeholder โดยไม่ทำให้หน้า Products ล้ม.
- Data Grid ใช้ `next/image` ขนาด 42px, `sizes="42px"`, `object-fit: cover` และ `unoptimized` เพื่อไม่ส่ง private signed token ผ่าน Image Optimizer.
- `next.config.ts` อนุญาตเฉพาะ Supabase signed-object path ของ bucket `product-images`.

## Security decisions

- bucket เป็น private; URL ไม่ใช่ public asset URL.
- authenticated role ไม่มี `INSERT/UPDATE/DELETE` บน `public.product_images` และไม่มีสิทธิ์เรียก trusted RPC.
- Storage ไม่มี authenticated UPDATE/DELETE policy จึง overwrite หรือ cleanup จาก browser ไม่ได้.
- creator เห็น lifecycle row ของตนเอง;ผู้มี `product.read` เห็นภาพที่พร้อมใช้งานภายใน Organization เท่านั้น.
- original filename เป็น metadata เท่านั้นและถูกจำกัด 180 ตัวอักษร/ห้าม control characters; path ไม่ใช้ filename จากผู้ใช้.
- ไม่รับ SVG เพื่อลด active-content risk และใช้ immutable path + cache control หนึ่งปีโดยไม่แทนที่ object เดิม.

## Verification evidence

- Supabase Production baseline clean replay: 90/90 + 7 bridges
- isolated Phase replay: 2.0.3.2 → 2.0.3.5 → 2.0.4 → 2.0.6 → R5 → R6 ผ่าน
- R6 SQL behavior/RLS transaction test ผ่านและ rollback
- R6 targeted tests: 5/5
- TypeScript ผ่านด้วย `--noEmit --incremental false`
- DB lint ผ่านสำหรับ R6; เหลือ warning เดิม `platform_simulate_sandbox_payment_event.v_payment` ซึ่งอยู่นอกขอบเขต R6

## Boundary and next gate

R6 ยังไม่สร้าง upload form/gallery editor และไม่สร้าง Product + SKU aggregate จริง งานถัดไปต้องได้รับอนุมัติแยกคือ **R7 — Unified Product Creation** ซึ่งต้องใช้ atomic aggregate command และนำ upload/cleanup contract นี้ไปใช้ ห้ามเรียก `product.create` และ `sku.create` แยกจนเกิด partial state.
