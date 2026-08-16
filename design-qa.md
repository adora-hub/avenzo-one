# Design QA — Phase B Part 5 Unified Variant Creation

วันที่ตรวจ: 16 สิงหาคม 2026

## เป้าหมาย

นำ Variant Builder จาก Approved Mockup มาใช้ในฟอร์มจริง โดยคงลำดับเนื้อหา, option cards, bulk tools, variant matrix, status controls และ responsive behavior

## หลักฐานภาพ

- Reference: `docs/mockups/evidence/phase-b5/mockup-variant-builder.png`
- Actual: `docs/mockups/evidence/phase-b5/actual-variant-builder.png`

## Interaction QA

- เลือกรูปแบบสินค้า Variant แล้ว builder แสดง: ผ่าน
- ค่าเริ่มต้น สี 2 ค่า × ไซซ์ 4 ค่า = 8 Combination: ผ่าน
- Bulk price ใช้กับทุกรายการ: ผ่าน
- F5 คืนค่า 8 Combination และราคาที่กรอก: ผ่าน
- จำกัด 3 กลุ่ม, 12 ค่าต่อกลุ่ม, 100 Combination: ผ่านจาก code/test gate

---

# Design QA — Product Creation Success Modal

วันที่ตรวจ: 16 สิงหาคม 2026

## Source visual truth

- ภาพอ้างอิง: `C:/Users/Windows/AppData/Local/Temp/codex-clipboard-db7f57ab-a1fb-41b1-ada6-fb02cf92098d.png`
- เป้าหมายที่อนุมัติ: ปุ่มหลัก 2 ปุ่มอยู่แถวบน และลิงก์ “ดูรายละเอียดสินค้านี้ →” อยู่แถวล่างกึ่งกลางเต็มความกว้าง
- Source pixels: 788 × 402 px
- State: Success dialog · light theme · desktop

## Implementation evidence

- Component: `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`
- Styles: `web/src/app/globals.css`
- Browser-rendered screenshot: unavailable
- Implementation pixels / CSS viewport / density: unavailable เพราะ in-app Browser เริ่มทำงานไม่ได้จาก Windows sandbox (`apply deny-read ACLs`)

## Full-view comparison

- Blocked: ไม่มี browser-rendered implementation screenshot จึงยังเปรียบเทียบภาพแบบ normalized view ไม่ได้

## Focused region comparison

- Static structure ยืนยันว่าปุ่ม “กลับหน้ารายการสินค้า” และ “สร้างสินค้ารายการถัดไป” อยู่ใน action grid เดียวกัน
- ลิงก์ “ดูรายละเอียดสินค้านี้ →” ถูกย้ายออกมาเป็นแถวถัดไป กึ่งกลาง และกว้างเต็ม footer
- Mobile rule เรียงปุ่มหลัก “สร้างสินค้ารายการถัดไป” ก่อนปุ่มรอง
- ยังไม่ถือเป็น visual evidence จนกว่าจะจับภาพจาก browser ได้

## Verification

- Regression tests: 10/10 passed
- TypeScript: passed
- Interaction contract: focus trap, Escape, navigation destinations และ no Stock side effect ยังถูกตรวจด้วย test

- Error state และ duplicate code guard: ผ่านจาก validation/test gate

## Visual QA

- โครงสร้าง card, spacing, typography และ matrix ตรง Approved Mockup
- ปรับ bulk toolbar ให้ปุ่มไม่ตัดบรรทัดในพื้นที่จริง
- แถบสรุปแสดงจำนวน Combination และช่วงราคาในโหมด Variant
- ฟอร์มจริงคง App Shell และ Sidebar ของระบบ ไม่ถือเป็นความแตกต่างจากตัว Mockup แบบ standalone

ผล: **ผ่านสำหรับ Owner verification**
---

# Design QA — Products Data Grid Variant Expansion

วันที่ตรวจ: 17 สิงหาคม 2026

## Source visual truth

- ภาพอ้างอิง: `C:/Users/Windows/AppData/Local/Temp/codex-clipboard-d18d849a-7fdf-416e-90f5-dc03cf1489b6.png`
- เป้าหมาย: Product หนึ่งแถวสามารถเปิดดู SKU Variant ที่ซ่อนอยู่ได้ โดยไม่เปลี่ยนฐานข้อมูลหรือ command ฝั่งระบบ
- State: Products Data Grid · desktop · Product ที่มี 2 SKU

## Implementation evidence

- Component: `web/src/app/organizations/[id]/products/products-data-grid.tsx`
- Styles: `web/src/app/globals.css`
- Regression test: `web/scripts/test-products-r7-4-default-grid-alignment.mjs`
- Browser-rendered screenshot: unavailable เพราะการเชื่อมต่อ in-app Browser ถูก Windows sandbox ปฏิเสธ (`apply deny-read ACLs`)

## Interaction QA

- Product ที่มีมากกว่า 1 SKU แสดงปุ่ม “ดู N ตัวเลือก”: ผ่านจาก component/test
- เปิด/ปิด Variant Card ด้วยปุ่มเดิมและ `aria-expanded`: ผ่านจาก component/test
- แสดงชื่อ Variant, SKU, รหัสขาย/CF, Barcode, ราคา, หน่วยนับ และสถานะจาก read model จริง: ผ่านจาก component/test
- รองรับคัดลอกรหัสแต่ละ SKU และหน้าจอ mobile: ผ่านจาก component/test
- Product ที่มี SKU เดียวยังคงเป็นแถวเดียว: ผ่านจากเงื่อนไข `skuCount > 1`
- มากกว่า 5 SKU แสดงจำนวนที่เหลือและลิงก์ไปจัดการ SKU ทั้งหมด: ผ่านจาก component/test

## Verification

- Focused regression: 7/7 passed
- Related Product Grid regressions: 21/21 passed
- TypeScript: passed
- Local Products route: server responded 307 to login for unauthenticated request; authenticated visual state must be checked in the user's signed-in browser

## Visual comparison

- Blocked: ไม่สามารถจับ implementation screenshot จาก browser ใน session นี้ จึงยังไม่สามารถยืนยัน pixel-level spacing และ overflow ของ Variant Card ได้

final result: blocked

---

# Design QA — Products Copy Controls

วันที่ตรวจ: 17 สิงหาคม 2026

## Source visual truth

- ภาพอ้างอิง: `C:/Users/Windows/AppData/Local/Temp/codex-clipboard-b80fe93f-e503-4bf6-ae6c-77e1d077e145.png`
- เป้าหมาย: ปุ่มคัดลอก SKU, รหัสขาย/CF และ Barcode ใช้ Copy icon มาตรฐานเดียวกัน พร้อม Tooltip ด้านบน
- State: Products Data Grid และ Variant Card · desktop

## Implementation evidence

- Component: `web/src/app/organizations/[id]/products/products-data-grid.tsx`
- Styles: `web/src/app/globals.css`
- Regression tests: `web/scripts/test-products-r7-4-default-grid-alignment.mjs`, `web/scripts/test-products-r7-visual-parity.mjs`, `web/scripts/test-products-r3-data-grid.mjs`

## Interaction QA

- Copy controls ทั้ง 6 ตำแหน่งใช้ shared `copyButton`: ผ่านจาก source audit/test
- ใช้ Copy icon เดียวกับตารางหลัก ไม่มีข้อความ “คัดลอก” เป็นปุ่ม: ผ่านจาก source audit/test
- Tooltip แสดงด้านบนเมื่อ hover และ keyboard focus: ผ่านจาก component/test
- สำเร็จเปลี่ยนเป็นเครื่องหมายยืนยันและข้อความ “คัดลอกแล้ว”: ผ่านจาก component/test
- Failure feedback แสดง “คัดลอกไม่สำเร็จ”: ผ่านจาก component/test

## Verification

- Product visual parity: 5/5 passed
- Product data grid: 6/6 passed
- Default grid alignment: 8/8 passed
- TypeScript: passed
- Browser-rendered visual comparison: unavailable เพราะ in-app Browser ถูก Windows sandbox ปฏิเสธ (`apply deny-read ACLs`)

final result: blocked

---

# Design QA — Products Inline Edit Alignment

วันที่ตรวจ: 17 สิงหาคม 2026

## Source visual truth

- ภาพอ้างอิง: `C:/Users/Windows/AppData/Local/Temp/codex-clipboard-8fbd397e-5a5d-4bd9-a8ab-75d7b6f39e69.png`
- เป้าหมาย: ไอคอนแก้ไข Stock และราคาขายอยู่ระดับเดียวกับข้อความหลัก พร้อม Tooltip ด้านบน

## Implementation evidence

- Component: `web/src/app/organizations/[id]/products/products-data-grid.tsx`
- Styles: `web/src/app/globals.css`
- Regression test: `web/scripts/test-products-r7-visual-parity.mjs`

## Interaction QA

- ไอคอนเริ่มจากแถวข้อความหลักด้วย `align-items: flex-start` และ offset 2px: ผ่านจาก source/test
- Stock และราคาใช้ Tooltip fixed ด้านบนตัวไอคอน: ผ่านจาก component/test
- Tooltip รองรับทั้ง mouse hover และ keyboard focus: ผ่านจาก component/test
- ถอด Tooltip pseudo-element ด้านล่างเดิมออกเพื่อไม่ให้ถูก cell overflow บัง: ผ่านจาก source audit

## Verification

- Product visual parity: 5/5 passed

---
# Design QA — Products Search Button Group

วันที่ตรวจ: 17 สิงหาคม 2026

## Source visual truth

- ภาพอ้างอิง: `C:/Users/Windows/AppData/Local/Temp/codex-clipboard-8883e790-50f9-4ff5-9516-02440e5f2a4e.png`
- Workspace copy: `web/products-search-button-group-reference.png`
- Source pixels: 699 × 59 px
- เป้าหมาย: ลดความกว้างรวมของช่องค้นหาและปุ่มค้นหาหลายรหัสประมาณ 40% พร้อมเชื่อมขอบเป็น Button Group โดยไม่เปลี่ยนพฤติกรรมเดิม
- State: Products Data Grid · desktop · light theme · idle

## Implementation evidence

- Component: `web/src/app/organizations/[id]/products/product-sku-workspace.tsx`
- Styles: `web/src/app/globals.css`
- Regression test: `web/scripts/test-products-r7-visual-parity.mjs`
- Local route: `http://localhost:3000/organizations/69408fd5-4f58-4546-9ab4-5b92009bd241/products` ตอบกลับ HTTP 200
- Browser-rendered screenshot: unavailable เพราะ in-app Browser ถูก Windows sandbox ปฏิเสธ (`apply deny-read ACLs`)
- Implementation pixels / CSS viewport / density: unavailable

## Focused comparison

- ลดชุดเดิมจากภาพอ้างอิงกว้าง 699px เหลือ track รวม 420px หรือ 60% ของความกว้างเดิมโดยประมาณ
- ช่องค้นหาและปุ่มอยู่ใน `product-search-button-group` เดียวกัน ไม่มี gap และใช้เส้นขอบร่วมกันด้วย `margin-left: -1px`
- ช่องค้นหาใช้รัศมีเฉพาะด้านซ้าย และปุ่มใช้รัศมีเฉพาะด้านขวา
- หน้าจอไม่เกิน 760px กลุ่มกลับเป็นความกว้าง 100% เพื่อไม่ให้ส่วนควบคุมแคบเกินไป

## Required fidelity surfaces

- Fonts and typography: ใช้ font, น้ำหนัก และความสูง 38px เดิมของ Products toolbar
- Spacing and layout rhythm: ลดความกว้างตามคำขอและเชื่อม control เป็นกลุ่มเดียว; ตัวกรองสถานะยังเป็น control แยก
- Colors and visual tokens: รักษาปุ่มดำ/ขาวและ hover token เดิมทั้ง light/dark theme
- Image quality and asset fidelity: ไม่มี raster asset ใน control; ไอคอนและข้อความเดิมไม่ถูกเปลี่ยน
- Copy and content: คง placeholder และข้อความ “ค้นหาหลายรหัส” เดิม

## Interaction verification

- การค้นหาแบบเรียลไทม์และ comma-separated search: ผ่าน regression test
- Enter เปิดหน้าต่างค้นหาหลายรหัส: ผ่าน regression test
- ปุ่มค้นหาหลายรหัส, ล้างคำค้นหา และตัวกรองสถานะ: handlers เดิมไม่ถูกแก้
- Product Visual Parity: 5/5 passed
- Product Data Grid: 7/7 passed
- TypeScript: passed
- `git diff --check`: passed

## Blocker

- ไม่สามารถจับภาพ implementation และเทียบแบบ side-by-side ใน session นี้ เนื่องจาก in-app Browser เริ่มทำงานไม่ได้จาก Windows ACL

final result: blocked
- Default grid alignment: 8/8 passed
- TypeScript: passed
- Browser-rendered visual comparison: unavailable เพราะ in-app Browser ถูก Windows sandbox ปฏิเสธ (`apply deny-read ACLs`)

final result: blocked

---

# Design QA — Products Sticky Actions Column

วันที่ตรวจ: 17 สิงหาคม 2026

## Source visual truth

- ภาพอ้างอิง: `C:/Users/Windows/AppData/Local/Temp/codex-clipboard-2919d20a-1965-40ec-80df-4e11bde59edc.png`
- Source pixels: 103 × 409 px
- เป้าหมาย: คอลัมน์การดำเนินการต้องมองเห็นเสมอทางขวาเมื่อเลื่อนตารางแนวนอน และหัวคอลัมน์ต้องสื่อความหมายของปุ่มเมนูในแต่ละแถว
- State: Products Data Grid · desktop · focused right edge

## Implementation evidence

- Component: `web/src/app/organizations/[id]/products/products-data-grid.tsx`
- Styles: `web/src/app/globals.css`
- Regression test: `web/scripts/test-products-r3-data-grid.mjs`
- Browser-rendered screenshot: unavailable เพราะ in-app Browser เริ่มทำงานไม่ได้จาก Windows sandbox (`apply deny-read ACLs`)
- Implementation pixels / CSS viewport / density: unavailable

## Focused comparison

- คอลัมน์คำสั่งกำหนดความกว้างคงที่ 72px และ `position: sticky; right: 0`
- หัวคอลัมน์แสดงสัญลักษณ์เมนู พร้อมชื่อสำหรับ screen reader ว่า “การดำเนินการ”
- เซลล์คอลัมน์รักษาสีพื้นหลังให้ตรงกับสถานะปกติ, hover และ selected
- มีเงาขอบซ้ายเพื่อแยกคอลัมน์ Fixed ออกจากข้อมูลที่เลื่อนผ่านด้านหลัง
- รองรับหัวตารางทั้งโหมดสว่างและโหมดมืด

## Required fidelity surfaces

- Fonts and typography: ใช้ขนาดและน้ำหนักเดียวกับปุ่มเมนูแถวเดิม
- Spacing and layout rhythm: ความกว้าง 72px และระยะซ้ายขวา 12px ตรงโครงสร้างเดิม
- Colors and visual tokens: ใช้ surface, hover และ selected tokens เดิมของ Products
- Image quality and asset fidelity: ไม่มี raster asset ในส่วนนี้; ใช้สัญลักษณ์เมนูเดิมของตาราง
- Copy and content: เพิ่มชื่อ “การดำเนินการ” สำหรับ accessibility โดยไม่เพิ่มข้อความรกในหัวตาราง

## Verification

- Product Data Grid tests: 7/7 passed
- Default Grid Alignment tests: 9/9 passed
- Visual Parity tests: 5/5 passed
- TypeScript: passed
- Local Products route: HTTP 200

## Blocker


---

# Design QA — Products Action Icon Hover and Tooltip

วันที่ตรวจ: 17 สิงหาคม 2026

## Source visual truth

- ภาพอ้างอิง: `C:/Users/Windows/AppData/Local/Temp/codex-clipboard-542999ee-cbd1-454c-81ed-4db2191058af.png`
- Source pixels: 103 × 304 px
- เป้าหมาย: Hover เปลี่ยนเฉพาะสีไอคอน `…` โดยไม่มีพื้นหลังหรือกรอบแบบปุ่ม และแสดง Tooltip ด้านบน

## Implementation evidence

- Component: `web/src/app/organizations/[id]/products/products-data-grid.tsx`
- Styles: `web/src/app/globals.css`
- Test: `web/scripts/test-products-r3-data-grid.mjs`
- Browser screenshot: unavailable เพราะ in-app Browser ถูก Windows ACL ปฏิเสธ (`apply deny-read ACLs`)

## Interaction verification

- Mouse hover และ keyboard focus แสดง Tooltip “การดำเนินการ” ผ่าน shared top-tooltip component
- Hover ไม่มีพื้นหลังและไม่มีกรอบ; เปลี่ยนเฉพาะสีไอคอน
- Focus-visible ยังคง focus ring เพื่อการใช้งานด้วยคีย์บอร์ด
- Click, Enter, Space และ ArrowDown ยังเปิดเมนูเดิม
- Product Data Grid tests: 7/7 passed
- Visual Parity tests: 5/5 passed
- TypeScript: passed

## Blocker

- ไม่สามารถจับภาพ Hover state จาก Browser เพื่อทำ pixel-level comparison ได้ใน session นี้

final result: blocked

---

# Design QA — Products Advanced Filter Bar Scaffold

วันที่ตรวจ: 17 สิงหาคม 2026

## Source visual truth

- ภาพอ้างอิง: `C:/Users/Windows/AppData/Local/Temp/codex-clipboard-adb3ccc4-a9d6-436c-a5b9-0b9d019cc42f.png`
- Source pixels: 1773 × 95 px
- เป้าหมาย: ใช้พื้นที่ว่างถัดจากสถานะเป็นโครงตัวกรองเพิ่มเติม โดยไม่รบกวนช่องค้นหาเดิมและเครื่องมือตารางทางขวา
- State: Products Data Grid · desktop · light theme · filter panel closed/open

## Implementation evidence

- Component: `web/src/app/organizations/[id]/products/product-sku-workspace.tsx`
- Styles: `web/src/app/globals.css`
- Regression test: `web/scripts/test-products-r7-visual-parity.mjs`
- Browser-rendered screenshot: unavailable
- Implementation pixels / CSS viewport / device density: unavailable เพราะทั้ง in-app Browser และ Windows Computer Use เริ่มทำงานไม่ได้จาก Windows sandbox (`apply deny-read ACLs`)

## Full-view comparison evidence

- Blocked: ไม่สามารถจับภาพ implementation ที่ viewport และ state เดียวกับภาพอ้างอิง จึงยังยืนยันระยะจริงระหว่างสถานะ ปุ่มตัวกรองเพิ่มเติม และไอคอนเครื่องมือตารางไม่ได้

## Focused region comparison evidence

- Static structure ยืนยันว่า Filter Bar มีสาม track: Search Button Group 420px, สถานะ 146px และพื้นที่ตัวกรองเพิ่มเติมที่ยืดได้
- ปุ่มเปิด–ปิดใช้ความสูง 36px, border radius 9px และ token เดียวกับ Combobox สถานะ
- แผงตัวกรองมีหัวข้อ คำอธิบาย empty state และ footer เตรียมไว้ โดยยังไม่เพิ่ม field ของข้อ 2–6
- หน้าจอไม่เกิน 760px เปลี่ยนเป็นหนึ่งคอลัมน์และปุ่ม/แผงกว้างเต็มพื้นที่
- Focused visual comparison ยังถูกบล็อกเพราะไม่มี browser-rendered screenshot

## Required fidelity surfaces

- Fonts and typography: ใช้ font inheritance และขนาด 12–15px ตามระบบ Products เดิม; ยังต้องยืนยันการ wrap จากภาพจริง
- Spacing and layout rhythm: ใช้ความสูง 36px และระยะ 4–16px ตาม toolbar เดิม; pixel comparison ยังถูกบล็อก
- Colors and visual tokens: ใช้ `surface`, `border`, `text`, `focus` tokens เดิม รองรับ light/dark โดยไม่เพิ่มค่าสีใหม่
- Image quality and asset fidelity: ไม่มี raster asset ใหม่; คง search และ table action icons เดิม
- Copy and content: ใช้คำว่า “ตัวกรองเพิ่มเติม” และอธิบายว่าต้องเลือกเงื่อนไขให้ครบก่อนค้นหา

## Primary interactions checked

- Click เปิด/ปิดแผง, click นอกพื้นที่ปิด, Escape ปิดและคืน focus: มี implementation และ TypeScript ผ่าน
- เปิดตัวกรองสถานะจะปิดแผงตัวกรองเพิ่มเติม และเปิดแผงเพิ่มเติมจะปิดสถานะ: มี implementation
- Visual Parity: 5/5 passed
- Product Data Grid: 7/7 passed
- Page Structure: 4/4 passed
- TypeScript: passed
- Console errors: ตรวจไม่ได้เพราะ browser runtime ถูกบล็อก

## Findings

- [P2] ยังไม่มี browser-rendered evidence สำหรับระยะและสถานะเปิดจริง
  - Location: Products toolbar / `.product-advanced-filter-panel`
  - Evidence: source เปิดอ่านได้เฉพาะ metadata แต่ Browser และ Computer Use จบด้วย Windows ACL error
  - Impact: ยังไม่สามารถยืนยัน pixel-level alignment, clipping, stacking และ dark mode จากภาพจริง
  - Fix: เปิด browser runtime ได้แล้วจับ desktop light/dark และ mobile open state จาก route ที่ล็อกอิน

## Comparison history

- รอบแรก: implementation และ automated gates ผ่าน แต่ visual comparison ถูกบล็อกก่อนมีภาพ implementation; ยังไม่มี P0/P1 และไม่มี visual fix ที่อ้างจากภาพจริง

final result: blocked
---

# Design QA — Products Advanced Filter Step 2

วันที่ตรวจ: 17 สิงหาคม 2026

## Source visual truth

- ภาพอ้างอิงสถานะเปิด: `C:/Users/Windows/AppData/Local/Temp/codex-clipboard-1d26cb46-9a2d-46bc-9949-34342d78df2f.png`
- Source pixels: 1793 × 603 px
- เป้าหมาย: ขยายแผงเป็น 680px เพิ่มวันที่สร้าง/วันที่แก้ไขและช่วงวันที่ โดยสถานะกับวันที่รอใช้พร้อมกันเมื่อกดค้นหา

## Implementation evidence

- Component: `web/src/app/organizations/[id]/products/product-sku-workspace.tsx`
- Server route: `web/src/app/organizations/[id]/products/page.tsx`
- Repository: `web/src/lib/foundation/supabase-repository.ts`
- Styles: `web/src/app/globals.css`
- Regression test: `web/scripts/test-products-r7-visual-parity.mjs`
- Browser-rendered screenshot: unavailable เพราะ session ไม่มี Browser/Chrome/Computer tool ที่เรียกใช้งานได้

## Interaction verification

- สถานะในหน้า Products เปลี่ยนเป็น draft และเปิดแผงเพื่อให้ผู้ใช้เห็นปุ่มค้นหา
- เลือกวันที่สร้างหรือวันที่แก้ไข พร้อมระบุเฉพาะวันเริ่ม วันสิ้นสุด หรือทั้งคู่ได้
- ช่วงวันที่ผิดลำดับแสดงข้อความเตือนก่อนส่ง URL
- ปุ่มล้างทั้งหมดล้างสถานะและวันที่ใน draft; ปุ่มค้นหาส่งสถานะและวันที่ครั้งเดียว
- URL ใช้ `date_by`, `date_from`, `date_to` และรักษาค่าเมื่อค้นหาหลายรหัส เปิด Quick View หรือเปลี่ยนหน้า
- Repository กรอง tenant-scoped products ด้วย `created_at` หรือ `updated_at` ตามเวลา Asia/Bangkok
- Panel desktop กว้างสูงสุด 680px; หน้าจอไม่เกิน 760px เรียงหนึ่งคอลัมน์

## Automated checks

- TypeScript: passed
- Visual Parity: 5/5 passed
- Product Data Grid: 7/7 passed
- Product Page Structure: 4/4 passed
- Responsive Visual Matrix: 13/13 passed
- Pagination: 4/4 passed
- `git diff --check`: passed

## Evidence limits

- ยังยืนยัน pixel-level alignment, native date-picker appearance, dark mode และ keyboard focus order จาก browser จริงไม่ได้
- ต้องรับภาพ F5 จากผู้ใช้ในสถานะเปิดแผงเพื่อปิด visual gate

final result: blocked

## Owner production parity approval

- Screenshot: `C:/Users/Windows/AppData/Local/Temp/codex-clipboard-36327a17-22bc-4a4c-a496-66f34a1bb035.png`
- Owner ยืนยันข้อ 1–2 และปุ่มที่แก้ไขผ่านเมื่อ 17 สิงหาคม 2026
- ปุ่มใช้ Products standard: Secondary แบบ outline และ Primary สีดำพร้อม hover สีเทา

final result: passed
