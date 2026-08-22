# AVENZO ONE Design System & UI/UX Standards V1

> มาตรฐานกลางสำหรับออกแบบ พัฒนา ตรวจสอบ และแก้ไขส่วนติดต่อผู้ใช้ของ AVENZO ONE โดยไม่ให้แต่ละหน้าหรือโมดูลค่อย ๆ เพี้ยนออกจากกัน

**เวอร์ชัน:** 1.6

**วันที่:** 18 สิงหาคม 2026

**สถานะ:** มาตรฐานบังคับสำหรับ Repository

**เอกสารที่เชื่อมโยง:** `AVENZO_ONE_UI_Mockup_First_Implementation_Guide_V1.md`, `AVENZO_ONE_Codex_Implementation_Starter_Plan_V7.md`

---

## 1. หน้าที่ของเอกสาร

เอกสารนี้เป็น Single Source of Truth สำหรับ:

- บุคลิกแบรนด์และหลักการ UX
- สี ฟอนต์ ระยะห่าง รูปทรง และ Design Tokens
- Shared Components และ State ที่ต้องรองรับ
- Page Patterns สำหรับหน้าประเภทต่าง ๆ
- Responsive และ Accessibility
- Component Catalog และ Visual Regression
- กฎการแก้ UI โดยคนและ Codex
- Definition of Done และ Checklist ก่อนส่งงาน

หากตัวอย่างในหน้า Feature ขัดกับเอกสารนี้ ให้ยึด Shared Component และมาตรฐานฉบับล่าสุดก่อน แล้วบันทึก Decision หากต้องเปลี่ยนมาตรฐานระดับระบบ

### 1.1 Mandatory Mockup-First Page Gate

งาน UI ทุกหน้าและทุกการเปลี่ยนแปลงที่ผู้ใช้มองเห็นต้องปฏิบัติตาม `AVENZO_ONE_UI_Mockup_First_Implementation_Guide_V1.md`:

- ต้องสร้างและอนุมัติ Mockup ก่อนเริ่ม Production UI
- Approved Mockup เป็น Page-level Source of Truth สำหรับ Visual, Layout และ Interaction
- Production implementation ต้องตรง Mockup ที่อนุมัติ 100% ในขอบเขตที่มองเห็นและใช้งานได้
- ห้ามผู้พัฒนาหรือ Codex เปลี่ยนดีไซน์เอง หากติดข้อจำกัดต้องหยุดและขออนุมัติ Deviation ก่อน
- Test หรือ Backend integration ที่ผ่านแล้วไม่ถือว่า UI เสร็จ หาก Visual Parity และ Owner approval ยังไม่ผ่าน
- เมื่อพบ Diff หลังปิด Part ให้ Reopen Part เดิมและห้ามเริ่ม Part ถัดไป

---

## 2. Brand Foundation

### 2.1 Brand Identity

| รายการ | มาตรฐาน |
|---|---|
| แบรนด์หลัก | **AVENZO** |
| ชื่อผลิตภัณฑ์เต็ม | **AVENZO ONE** |
| ประเภทระบบ | **Business Operating Platform (BOP)** |
| บุคลิก | Modern, Professional, Clear, Trustworthy, Efficient |
| ชื่อทั่วไปใน UI | AVENZO |
| ชื่อทางการ/Login | AVENZO ONE |

### 2.2 ความรู้สึกที่ต้องการ

- ทันสมัย แต่ไม่ตามแฟชั่นจนใช้งานยาก
- เป็นมืออาชีพและน่าเชื่อถือสำหรับข้อมูลธุรกิจ
- สะอาด อ่านเร็ว และรองรับข้อมูลจำนวนมาก
- เป็นมิตรกับผู้ใช้ที่ไม่เชี่ยวชาญเทคโนโลยี
- ให้ความสำคัญกับลำดับข้อมูลมากกว่าการตกแต่ง

### 2.3 หลักการ UX

1. **Clarity first:** ผู้ใช้ต้องเห็นว่าตนอยู่หน้าใด ข้อมูลอยู่ในสถานะใด และควรทำอะไรต่อ
2. **One clear primary action:** แต่ละ Section หรือ Dialog มีการกระทำหลักชัดเจนหนึ่งรายการ
3. **Safe by default:** การลบ ยกเลิก อนุมัติ และเปลี่ยนข้อมูลสำคัญต้องป้องกันความผิดพลาด
4. **Consistent behavior:** สิ่งที่หน้าตาเหมือนกันต้องทำงานเหมือนกัน
5. **Recoverable:** เมื่อเกิด Error ข้อมูลที่ผู้ใช้กรอกต้องไม่หาย และต้องบอกวิธีแก้
6. **Permission-aware:** ไม่แสดง Action ที่ทำไม่ได้โดยไม่มีคำอธิบาย
7. **Data density with readability:** ตารางธุรกิจต้องเห็นข้อมูลเพียงพอโดยไม่แน่นจนอ่านยาก

---

## 3. Design Token Policy

Component และหน้า Feature ต้องอ้างอิง Semantic Token ห้ามใช้ค่าสี ระยะ Radius หรือ Shadow แบบเฉพาะจุด เว้นแต่มีเหตุผลและ Decision Record

Token แบ่งเป็นสองชั้น:

```text
Primitive Tokens → Semantic Tokens → AVENZO Components → Feature Pages
```

- Primitive Token: ค่าพื้นฐาน เช่น `blue-600`, `space-4`
- Semantic Token: ความหมาย เช่น `primary`, `danger`, `surface`, `border`
- Feature Page ต้องเรียก Component หรือ Semantic Token ไม่เรียก Primitive โดยตรงเมื่อไม่จำเป็น

### 3.1 สีตั้งต้น

ชุดสีนี้เป็นค่าเริ่มต้น ต้องตรวจ Contrast และ Brand Approval ใน Component Catalog ก่อนล็อกใช้งานจริง

| Token | Light | Dark | ใช้กับ |
|---|---:|---:|---|
| `background` | `#F8FAFC` | `#0B1120` | พื้นหลังแอป |
| `surface` | `#FFFFFF` | `#111827` | Card, Panel, Dialog |
| `text-primary` | `#0F172A` | `#F8FAFC` | ข้อความหลัก |
| `text-secondary` | `#64748B` | `#94A3B8` | ข้อมูลรอง |
| `border` | `#E2E8F0` | `#334155` | เส้นแบ่งและกรอบ |
| `primary` | `#4F46E5` | `#818CF8` | Action หลักและ Focus |
| `primary-hover` | `#4338CA` | `#A5B4FC` | Hover ของ Action หลัก |
| `success` | `#15803D` | `#4ADE80` | สำเร็จ/สถานะบวก |
| `warning` | `#B45309` | `#FBBF24` | คำเตือน |
| `danger` | `#B91C1C` | `#F87171` | Error/Destructive |
| `info` | `#0369A1` | `#38BDF8` | ข้อมูลทั่วไป |

กฎสี:

- ห้ามใช้สีเพียงอย่างเดียวเพื่อสื่อความหมาย ต้องมีข้อความหรือ Icon ร่วมด้วย
- สีแดงสงวนไว้สำหรับ Error, Danger และรายการที่ต้องระวัง
- สีเขียวไม่ใช้ตกแต่งสิ่งที่ไม่เกี่ยวกับ Success หรือสถานะบวก
- จำนวนเงินติดลบต้องมีเครื่องหมายและข้อความที่เข้าใจได้ ไม่พึ่งสีแดงอย่างเดียว
- Contrast ของข้อความทั่วไปเป้าหมายอย่างน้อย WCAG AA

### 3.2 Typography

ฟอนต์ตั้งต้น: **Noto Sans Thai** สำหรับภาษาไทย และ **Inter** สำหรับภาษาอังกฤษ โดยมี System Fallback; ตัวเลขตารางใช้ `font-variant-numeric: tabular-nums`

| Style | ขนาดตั้งต้น | น้ำหนัก | ใช้กับ |
|---|---:|---:|---|
| Display | 36 px | 700 | Login/Landing เท่านั้น |
| Heading 1 | 28 px | 700 | ชื่อหน้าหลัก |
| Heading 2 | 22 px | 600 | Section หลัก |
| Heading 3 | 18 px | 600 | Card/Panel |
| Body | 16 px | 400 | เนื้อหาทั่วไป |
| Body Small | 14 px | 400 | ตารางและข้อมูลรอง |
| Label | 14 px | 500 | Label ฟอร์ม |
| Control Compact | 13 px | 400 | ช่อง Tag/Token, ช่องกรอกแบบ Inline และ Control ที่อยู่ในพื้นที่หนาแน่น |
| Caption | 12 px | 400 | Metadata/Helper text |

กฎตัวเลขและวันที่:

- เงิน: `฿12,450.00` และชิดขวาในตาราง
- จำนวน: `1,250 ชิ้น`
- วันที่ทั่วไป: `5 ส.ค. 2026`
- วันเวลาที่ต้องตรวจสอบย้อนหลัง: `5 ส.ค. 2026, 14:30 น.` พร้อม Timezone เมื่อจำเป็น
- ห้ามผสมรูปแบบวันที่หลายแบบในหน้าเดียวกัน

### 3.3 Spacing, Radius และ Shadow

- Spacing scale: `4, 8, 12, 16, 24, 32, 48, 64 px`
- Radius: `sm 6px`, `md 8px`, `lg 12px`, `xl 16px`
- ใช้ Shadow เฉพาะเมื่อช่วยบอก Layer เช่น Popover, Dropdown, Dialog
- Card ทั่วไปใช้ Border ก่อน Shadow
- Touch target ต้องไม่น้อยกว่า `44 × 44 px` เมื่อใช้งานบนจอสัมผัส

### 3.4 ตัวอย่าง Token

```css
:root {
  --background: 248 250 252;
  --surface: 255 255 255;
  --text-primary: 15 23 42;
  --text-secondary: 100 116 139;
  --border: 226 232 240;
  --primary: 79 70 229;
  --success: 21 128 61;
  --warning: 180 83 9;
  --danger: 185 28 28;
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
}
```

ชื่อ Token ในโค้ดปรับตาม Tailwind/shadcn เวอร์ชันจริงได้ แต่ Semantic Meaning ต้องคงที่และมี Mapping กลางเพียงจุดเดียว

---

## 4. Component Architecture

โครงสร้างแนะนำ:

```text
src/
├── components/
│   ├── ui/          # Primitive/shared UI
│   ├── forms/       # Domain-neutral form controls
│   ├── tables/      # Data table and cells
│   ├── patterns/    # Page-level patterns
│   └── feedback/    # Alert, toast, states
├── styles/
│   └── tokens.css
└── design-system/
    ├── README.md
    └── examples/
```

กฎการสร้าง Component:

1. ค้นหา Component เดิมและ Usage ก่อนสร้างใหม่
2. ถ้าความต่างเป็น Visual/State ให้เพิ่ม Variant แทน Copy Component
3. ถ้าความต่างเป็น Business Logic ให้ Compose Component กลางในโมดูล
4. ห้ามแก้ Public API ของ Shared Component โดยไม่วิเคราะห์ผลกระทบ
5. Shared Component ต้องมี Accessible Name, Focus, Disabled และ Error State ตามประเภท

---

## 5. Component Standards

### 5.1 Button

Variant มาตรฐาน:

| Variant | ใช้เมื่อ |
|---|---|
| `primary` | Action หลักของ Section/Dialog |
| `secondary` | Action รอง |
| `outline` | Action ที่ต้องเห็นแต่ไม่แข่งขันกับ Primary |
| `ghost` | Action เบา เช่น ปิดหรือเมนูในแถว |
| `danger` | ลบ ยกเลิก หรือการกระทำย้อนกลับยาก |
| `link` | นำทางที่มีลักษณะเป็นข้อความ |

ทุกปุ่มต้องรองรับ Default, Hover, Focus-visible, Active, Loading และ Disabled

- ปุ่มมาตรฐาน (`primary`, `secondary`, `outline`, `danger`) ใช้ความสูงกลาง 44 px
- ปุ่มแบบ Compact ใช้ความสูงกลาง 38 px และใช้เฉพาะ Action ย่อย เช่น Action ในตาราง
- **Input-Button Group Height Parity:** Input, Select, and Button controls that form one inline action group must share `--input-action-group-height` and have the same computed height.
- Use 34 px for dense desktop groups and 44 px for coarse-pointer/touch targets. The Button must use zero block padding and must never inherit a larger minimum height than its paired field.
- Apply the reusable `input-action-group` pattern, or a feature group explicitly mapped to this contract. Do not reduce the global Compact Button height to solve a local mismatch.
- Helper or error text may extend below a field, but it must not alter the paired controls' height.
- Controls in one horizontal action row must share the same top and bottom edge (visual tolerance no more than 1px). Reserve a row-wide helper zone or position helper text below the control without letting one field's helper text push that control above adjacent controls.
- การ์ดแบบฟอร์มที่อยู่ใน Grid แถวเดียวกันต้องวางปุ่มหลักที่แนวฐานเดียวกัน โดยใช้ Pattern `form-card-with-footer` เพื่อดัน Action สุดท้ายไว้ด้านล่างของการ์ด
- ห้ามแก้ตำแหน่งปุ่มด้วย Margin เฉพาะหน้า หรือกำหนดความสูงการ์ดแบบ Hard-code
- ขณะ Loading ให้กันการกดซ้ำและคงความกว้างของปุ่ม
- ปุ่ม Icon-only ทุกปุ่มต้องมี Accessible Label และ Tooltip เสมอ โดย Tooltip แสดงด้านบนเป็นค่าเริ่มต้น เว้นแต่พื้นที่ไม่พอจึงค่อยเปลี่ยนทิศทาง
- ปุ่มต้องมี Feedback ทางสายตาเมื่อ Hover เช่น เปลี่ยนสีเล็กน้อย ยกตัวเล็กน้อย หรือแสดง Shadow อย่างพอดี โดยไม่ทำให้ Layout กระโดด
- Dialog มาตรฐานวาง Primary ด้านขวา และ Cancel ก่อนหน้า Primary
- **Live Sale Accent Exception:** เฉพาะพื้นที่ทำงาน Live Sale ปุ่มหลักและ Badge ใช้พื้นหลัง `#AAE600`, Hover `#D6E600` และตัวอักษร `#000000`; ต้อง Scope ผ่าน Container ของ Live Sale และห้ามเปลี่ยน Primary Button หรือ Badge ส่วนกลางของระบบ
- **Dense Secondary Utility Row:** แถบคำสั่งรองใต้เครื่องมือแบบกลุ่มใช้ `--surface-subtle` ต่อเนื่องกับพื้นของแผงและมีเส้นคั่นด้านบน ห้ามสร้างแถบพื้นขาวแยกชั้น; Ghost Button Group ทางซ้ายและ Outline Undo ทางขวาต้องสูง 34px ใช้ตัวอักษร 12px พร้อม Icon. Undo แสดงเฉพาะเมื่อย้อนกลับได้จริง และ Icon control ทุกตัวต้องมี Tooltip ด้านบน. ผลสำเร็จชั่วคราวแสดงเป็น Toast ด้านบนกึ่งกลาง ส่วน Error ที่ผู้ใช้ต้องแก้ยังคงอยู่ใกล้เครื่องมือ
- Action ที่ย้อนกลับยากต้องมี Confirmation พร้อมชื่อรายการและผลที่จะเกิด

### 5.2 Form

Component ขั้นต่ำ:

- `TextField`, `TextArea`
- `NumberField`, `MoneyField`
- `Select`, `MultiSelect`, `Combobox`
- `DatePicker`, `DateRangePicker`
- `Checkbox`, `RadioGroup`, `Switch`
- `FileUpload`
- `FormSection`, `FieldError`, `FormActions`

โครงสร้างทุก Field:

```text
Label + Required indicator
Control
Helper text หรือ Error message
```

กฎ:

- แสดง Validation ใกล้ Field และมี Summary เมื่อฟอร์มยาว
- ไม่ล้างข้อมูลที่กรอกเมื่อ Server Error
- Disabled และ Read-only ต้องมีพฤติกรรมและหน้าตาต่างกันชัดเจน
- ช่องจำนวนเงินกำหนด Currency และ Decimal Precision อย่างชัดเจน
- ห้ามใช้ Placeholder แทน Label
- บันทึกสำเร็จต้องมี Feedback และป้องกัน Double Submit
- ช่อง Tag/Token ใช้ `--font-size-control-compact` (13 px), น้ำหนัก 400 และ line-height 1.4 เป็นมาตรฐาน ทั้งข้อความที่กรอกและ Placeholder; ห้ามกำหนดขนาดเฉพาะหน้า
- Form Section ที่เป็นลำดับงานใช้ `เลขลำดับวงกลม 25×25px + Heading 18px + คำอธิบาย 13px` โดยวางเลข, Heading และคำอธิบายในแถวเดียวกัน รูปแบบ `หัวข้อ (คำอธิบาย)`; เมื่อพื้นที่ไม่พอจึงค่อยตัดคำอธิบายลงบรรทัดใหม่ และห้ามเพิ่ม Kicker ที่กล่าวซ้ำว่าเป็น “ขั้นตอนที่”
- Label ใช้ขนาด 14px น้ำหนัก 500 และวางชื่อ Field, เครื่องหมาย `*` และ Info icon สำคัญไว้ในแถวเดียวกัน
- Info icon ของ Form ใช้ขนาด 18px, เปิดได้ด้วย Hover, Focus และ Click, มี Accessible Label และ Tooltip ด้านบนเป็นค่าเริ่มต้น
- Combobox ที่ต้องควบคุม Visual Parity ใช้ Custom listbox: เมนูพื้นขาว, Hover และรายการที่เลือกใช้ `--surface-subtle`, ตัวอักษรสีหลัก พร้อมเครื่องหมายถูก; ห้ามปล่อย Selected state เป็นสีน้ำเงินของ Native Select และต้องรองรับ Arrow keys, Home/End, Enter, Space, Escape และ Tab
- Switch สำหรับเปิด–ปิด Section ใช้ Track ขนาด 62×28px และ Thumb 20px โดยแสดงคำว่า `ปิด` ภายใน Track เมื่อปิด และ `เปิด` เมื่อเปิด; สถานะปิดใช้พื้นกลาง สถานะเปิดใช้ Accent ของพื้นที่งาน และต้องคง Keyboard/Focus behavior ของ Control เดิม ห้ามใช้ลูกศรแทนสถานะ Switch

### 5.3 Data Table

Shared `DataTable` ต้องรองรับตามบริบท:

- Search, Filter, Sorting, Pagination
- Column visibility และ Column alignment
- Row selection และ Bulk action
- Sticky header เมื่อข้อมูลยาว
- Pagination footer ของ Data Grid แบบยาวใช้ position: sticky ที่ด้านล่างของ Page/Panel พร้อมพื้นหลังทึบ เส้นคั่น และเงาด้านบน; หน้า List บน Desktop ต้องตัด Bottom gutter ของ Content เพื่อให้ Footer แนบขอบล่าง Workspace จริง ห้ามใช้ Global fixed bar และห้ามทับ Horizontal scrollbar หรือแถวข้อมูลสุดท้าย
- Loading skeleton, Empty, Error และ Permission state
- Action menu ที่ตรวจ Permission
- Responsive fallback เช่น Priority columns, Horizontal scroll หรือ Card list
- Export พร้อมสิทธิ์และ Audit เมื่อข้อมูลอ่อนไหว

กฎการจัดแนว:

- ข้อความชิดซ้าย
- จำนวน เงิน และเปอร์เซ็นต์ชิดขวา
- Status และ Action ใช้ตำแหน่งเดิมในทุกตาราง
- ห้ามซ่อนข้อมูลสำคัญไว้หลัง Hover เพียงอย่างเดียว

Expanded child rows (เช่น SKU / ตัวเลือกใต้ Product) ต้องใช้ Column preference ชุดเดียวกับตารางหลัก ได้แก่ ลำดับ การแสดง/ซ่อน ความกว้าง และการปักหมุด พร้อมคง Action column ไว้ด้านขวาเสมอ ข้อมูลระดับ SKU ต้องใช้ค่าของ SKU นั้นจริง ส่วนข้อมูลระดับ Product ให้แสดงซ้ำอย่างโปร่งใส ห้ามนำยอดรวม Product มาแสดงเป็นยอดต่อ SKU ตารางย่อยให้สร้างเมื่อผู้ใช้กางแถวและใช้ Read Model ชุดเดิม เพื่อหลีกเลี่ยง N+1 request และไม่เพิ่มภาระตอนตารางยังปิดอยู่ รูปภาพในแถว SKU ต้องใช้รูปที่ผูกกับ SKU/Variant นั้นก่อนเสมอ หากไม่มีจึงใช้รูปปก Product เป็น fallback และหากไม่มีทั้งคู่จึงแสดง placeholder ห้ามนำรูปปก Product มาใช้แทนทุก Variant โดยไม่ตรวจการผูกรูป

### 5.4 Badge และ Status

- ใช้ Semantic Variant เช่น `neutral`, `info`, `success`, `warning`, `danger`
- Status เดียวกันต้องใช้ Label และสีเดียวกันทั่วระบบ
- ใช้ทั้งข้อความและสี เช่น “รออนุมัติ” ไม่ใช้จุดสีอย่างเดียว
- Badge ไม่ควรดูเหมือนปุ่มถ้ากดไม่ได้

#### 5.4.1 Tag Badge

ใช้ Pattern นี้เมื่อแสดงป้ายกำกับสินค้าใน Data Table, Expanded SKU row, Quick View หรือพื้นที่ข้อมูลแบบกระชับ:

- แสดง Tag แต่ละรายการเป็น Badge แยกจากกัน ห้ามรวมเป็นข้อความคั่นด้วย comma
- ใช้ชุดสี Semantic สำหรับ Tag โดยเฉพาะ เช่น `neutral`, `info`, `indigo`, `purple`, `pink`; ห้ามใช้ `danger`, `success` หรือ `warning` เป็นสีตกแต่ง
- การเลือกสีต้องเป็น deterministic: Tag เดิมได้สีเดิมเมื่อ Refresh และการแสดงภายในแถวเดียวกันต้องหลีกเลี่ยงสีซ้ำจนกว่าชุดสีจะครบ
- Badge ต้องเรียงแนวนอนแถวเดียว (`nowrap`) ใน Data Table และไม่ทำให้ความสูงแถวเพิ่มจากการตัดบรรทัด
- Badge แต่ละรายการต้องคงความกว้างตามข้อความ (`flex: 0 0 auto`) ห้ามย่อหรือบีบข้อความเมื่อ Column แคบ
- เมื่อพื้นที่ Column ไม่พอ ให้ Container ซ่อนส่วนเกินและผู้ใช้ขยาย Column เพื่อดูรายการเพิ่มเติม; ห้ามลดขนาด Font, Padding หรือ Badge เพื่อยัดข้อมูล
- ใช้ความสูงขั้นต่ำ 22px, Padding แนวนอน 7px, Gap 5px, Radius 6px และ Font 11px ตาม Density ของ Products Data Grid
- ข้อความใน Badge ใช้บรรทัดเดียวและต้องมี Accessible label รวมของรายการ Tags ใน Cell
- Badge เป็นข้อมูลแบบ Read-only ต้องไม่มี Hover, Cursor หรือ Surface ที่ทำให้ดูเหมือนปุ่ม
- สี Border, Surface และ Text ต้องอ้างอิง Semantic Tokens และมีค่า Light/Dark Theme ครบ

### 5.5 Dialog, Drawer และ Popover

- Dialog ใช้กับการตัดสินใจที่ต้องหยุด Flow ชั่วคราว
- Drawer ใช้กับ Detail/Quick edit ที่ยังต้องเห็นบริบทเดิม
- Popover ใช้กับตัวเลือกขนาดเล็ก ไม่ใช้แทน Form ยาว
- ต้อง Trap Focus, ปิดด้วย Escape เมื่อปลอดภัย และคืน Focus สู่ต้นทาง
- Destructive Dialog ต้องระบุผลกระทบและไม่ตั้ง Primary Action เป็นค่าเริ่มต้นแบบเสี่ยง

#### 5.5.1 Master Data Picker Dialog

ใช้ Pattern นี้เมื่อผู้ใช้ต้องเลือก Master Data เพื่อนำไปใช้กับหลายรายการ เช่น แบรนด์ หมวดหมู่ และป้ายกำกับสินค้า โดยต้องใช้โครงสร้างและพฤติกรรมเดียวกันทั้งระบบ:

- Header แสดงชื่อการทำงาน คำอธิบายสั้น และปุ่มปิดแบบ Icon
- Scope summary แสดงจำนวน Product ที่เลือกและจำนวน SKU รวมก่อนเริ่มเลือกค่า
- ช่องค้นหากรองผลแบบทันที พร้อม Empty state เมื่อไม่พบข้อมูล
- รายการใช้พื้นที่แนวนอนแบบกระชับ สูง 3 แถว และเลื่อนแนวนอนได้เมื่อมีข้อมูลจำนวนมาก
- แบรนด์และหมวดหมู่เลือกได้ค่าเดียวด้วย Radio; ป้ายกำกับเลือกได้หลายค่าด้วย Checkbox และต้องระบุโหมด เพิ่ม/นำออก/แทนที่
- Badge `ใช้ล่าสุด` ใช้พื้นหลังสีแดง ตัวอักษรสีขาว; Badge `ใช้บ่อย` ใช้พื้นหลังสีดำ ตัวอักษรสีขาว และ Badge ต้องไม่ดูเหมือนปุ่ม
- หากรายการเดียวกันเข้าเงื่อนไขทั้งสองแบบ ให้แสดง `ใช้ล่าสุด` ก่อน
- ใช้ `IconInfoHexagon` ขนาด 18px โดยไม่มีพื้นหลังหรือกรอบแบบปุ่ม; Hover หรือ Keyboard focus ที่ Icon เท่านั้นจึงแสดง Tooltip ด้านขวา พร้อมจำนวนสินค้าที่ใช้งานค่านั้น
- Summary ด้านล่างแสดงจำนวนสินค้า จำนวน SKU และจำนวน Master Data ทั้งหมด พร้อมปุ่มจัดการ Master Data ตามสิทธิ์
- Footer ใช้ปุ่มรอง “ยกเลิก” และปุ่มหลักสีดำ “นำไปใช้กับรายการที่เลือก” ตามมาตรฐาน Button
- Dialog ต้อง Trap focus, รองรับ Escape, คืน Focus สู่ปุ่มต้นทาง และมี Accessible name/description ครบ
- Desktop ใช้ความกว้างไม่เกิน `min(960px, 100vw - 32px)`; หน้าจอแคบต้องยังอ่านและใช้งานได้โดยไม่ตัด Action สำคัญ

Pattern นี้ไม่ใช้แทนการแก้ราคา ต้นทุน หรือสต็อก เพราะงานระดับ SKU เหล่านั้นต้องมี Scope, Preview, Validation และ Audit ที่เฉพาะเจาะจง

#### 5.5.2 Master Data Manager Dialog

ใช้ Pattern นี้กับหน้าต่างจัดการข้อมูลอ้างอิง เช่น `จัดการหมวดหมู่สินค้า`, `จัดการแบรนด์` และ `จัดการป้ายกำกับ` โดยต้องใช้ Component contract และโครงสร้างเดียวกัน เปลี่ยนเฉพาะชื่อชนิดข้อมูลและข้อความปุ่มบันทึก:

- Header แสดง `จัดการ{ชื่อ Master Data}` พร้อมคำอธิบาย “เพิ่ม แก้ชื่อ หรือเก็บ{ชื่อ Master Data}ที่ไม่ใช้แล้ว” และปุ่มปิดแบบ Icon-only
- Dialog บน Desktop ใช้ความกว้าง `min(720px, 100vw - 32px)` และความสูงไม่เกิน `min(820px, 100dvh - 40px)`; Header และ Footer ต้องคงที่ ส่วน Body เป็น Scroll container หลักเพียงจุดเดียว
- Toolbar ใช้ช่องค้นหาเต็มพื้นที่และแสดงจำนวนรายการชิดขวา การค้นหาต้องกรองรายการทันทีและมี Empty state
- รายการ Master Data แสดงหนึ่งรายการต่อแถว ภายในกรอบ Surface subtle; ชื่อเป็น Text field และ Action `เก็บถาวร` ใช้ Compact secondary button สูง 38px
- รายการที่เก็บถาวรแล้วต้องเป็น Read-only, แสดงชื่อแบบขีดฆ่า และปุ่ม Disabled `เก็บถาวรแล้ว`; ห้ามสื่อว่าสามารถเปิดกลับได้หากระบบไม่รองรับ
- โซนเพิ่มข้อมูลต้องแยกจากรายการด้วย Divider มี Label `เพิ่ม{ชื่อ Master Data}`, Textarea รองรับ comma/ขึ้นบรรทัดใหม่ และปุ่ม `＋ เพิ่มรายการ`; จำกัดจำนวนและความยาวตาม Validation ของระบบ
- Permission notice ใช้ Info surface ระบุสิทธิ์ `product.manage`, การบันทึกผ่าน trusted command, Audit Log และนโยบายรายการที่เก็บถาวร
- Footer วาง Compact secondary button `ยกเลิก` ก่อน Primary สีดำ `บันทึก{ชื่อ Master Data}` ทางขวา; ขณะบันทึกต้องป้องกันการกดซ้ำและคงความกว้างปุ่ม
- ต้อง Trap focus, รองรับ Escape เมื่อไม่กำลังบันทึก, ปิดด้วย Backdrop เมื่อปลอดภัย และคืน Focus สู่ปุ่มต้นทาง
- การบันทึกต้องตรวจชื่อว่าง อักขระต้องห้าม และชื่อ Active ซ้ำกัน; เมื่อ Server Error ต้องคงรายการที่ผู้ใช้แก้ไว้และบอกวิธีแก้ใกล้ Footer
- หน้าจอแคบให้ Dialog กว้างเต็มพื้นที่ที่เหลือ รายการยังคงหนึ่งคอลัมน์ และ Footer ต้องไม่บัง Textarea, Permission notice หรือ Error

Pattern นี้เป็นงานจัดการ Master Data และไม่ใช้แทน `Master Data Picker Dialog`; เมื่อเปิดจาก Picker ให้ Manager อยู่ Layer สูงกว่า และเมื่อบันทึกสำเร็จต้องอัปเดตรายการใน Picker เดิมทันทีโดยไม่ต้อง Reload หน้า

#### 5.5.3 Bulk SKU Edit Dialog

ใช้ Pattern นี้กับการแก้ราคา ต้นทุน และสต็อกหลาย SKU:

- Dialog แสดง Scope summary, ตัวเลือกขอบเขต SKU, Controls และ Preview ก่อนยืนยันตามลำดับ
- Segmented control ใช้ความสูง 40px, ตัวอักษร 13px น้ำหนัก 600, เส้นแบ่งชัด และรองรับ Focus-visible
- Input และ Combobox ใช้ความสูง 42px, Radius 9px และ Border token กลาง; ลูกศร Combobox อยู่ห่างขอบขวา 12px ตาม Select มาตรฐาน
- Preview table ต้องมีกรอบรอบนอก เส้นแบ่งแถวและคอลัมน์ หัวตาราง Sticky และจัดตัวเลขชิดขวา
- Preview สูงไม่เกิน 310px และเลื่อนแนวตั้ง/แนวนอนได้ โดยต้องเห็น Scrollbar เมื่อข้อมูลล้น
- หน้าจอแคบให้เรียง Panel เป็นหนึ่งคอลัมน์และคงตารางแบบเลื่อนแนวนอน เพื่อไม่ให้ชื่อหัวคอลัมน์สูญหาย
- Dialog ใช้โครงสร้าง Flex column โดย Header และ Footer ไม่ยืด ส่วน Body เป็น Scroll container หลักเพียงจุดเดียว (`flex: 1; min-height: 0; overflow-y: auto`)
- Footer ต้องเป็น Sibling ต่อจาก Body และห้ามวางซ้อน Preview; เมื่อเลือก SKU เฉพาะรายการ ผู้ใช้ต้องเลื่อน Modal เพื่อเห็น Preview ได้ครบ
- Footer ใช้ Compact button สูง 38px: Cancel แบบ Secondary อยู่ซ้าย และ Primary สีดำอยู่ขวา
- ห้ามใช้ Token ที่ไม่มีใน Design System; Border, Surface และ Text ต้องอ้าง `--border-default`, `--surface-elevated`, `--surface-subtle`, `--text-primary` หรือ `--text-secondary`

### 5.6 Feedback และ System States

ทุกหน้าต้องออกแบบ State ที่เกี่ยวข้องก่อนถือว่าเสร็จ:

| State | สิ่งที่ต้องสื่อ |
|---|---|
| Loading | กำลังรออะไรและ Layout ไม่กระโดด |
| Empty | ไม่มีข้อมูลเพราะอะไรและเริ่มต้นอย่างไร |
| Error | เกิดอะไรขึ้น ข้อมูลปลอดภัยหรือไม่ และทำอะไรต่อ |
| Success | สิ่งใดสำเร็จและผลอยู่ที่ใด |
| Disabled | เหตุใดทำไม่ได้เมื่อจำเป็น |
| Permission denied | ไม่มีสิทธิ์อะไรและติดต่อใครได้ |
| Offline/Retry | การเชื่อมต่อล้มเหลวและลองใหม่อย่างไร |

Toast ใช้กับ Feedback ชั่วคราว; Error ที่ต้องแก้ไขต้องอยู่ใกล้ต้นเหตุและไม่หายไปเองก่อนอ่านจบ

---

## 6. Page Patterns

### 6.1 App Shell

- Global navigation และ Organization context
- Page title/Breadcrumb ในตำแหน่งคงที่
- Notification และ User menu เข้าถึงได้ทุกหน้า
- Main content มีความกว้างและ Padding ตาม Token
- Mobile navigation ต้องใช้ Keyboard และ Screen Reader ได้

### 6.2 List Page

```text
Breadcrumb
Page title + Description + Primary action
Optional summary cards
Search + Filters + View controls
Data table/List
Pagination
```

### 6.3 Form Page

```text
Breadcrumb
Page title + Status
Validation summary when needed
Form sections
Related documents/activity
Cancel + Save actions
```

Form ยาวควรแบ่ง Section ตามงาน ไม่แบ่งเพราะต้องการ Card หลายใบ และต้องมี Unsaved Changes Protection เมื่อเหมาะสม

### 6.4 Detail Page

```text
Identity + Status + Actions
Key summary
Tabs/Sections
Activity timeline
Attachments and audit metadata
```

### 6.5 Dashboard

```text
Date range + Organization/Branch filters
KPI cards
Charts with accessible summaries
Action Center
Recent activity
```

Dashboard ต้องตอบคำถามทางธุรกิจ ไม่ใช่เพียงนำ Card และ Chart มาวางให้เต็มหน้า

---

## 7. Responsive Standards

Breakpoint ให้ยึดค่าจาก Tailwind config ของ Repository และบันทึกเป็น Source of Truth เดียว ตัวอย่างแนวคิด:

| View | เป้าหมาย |
|---|---|
| Mobile | งานหลัก ทำรายการ ดูสถานะ และค้นหาง่าย |
| Tablet | Form และรายการแบบสองส่วนเมื่อพื้นที่พอ |
| Desktop | ตารางข้อมูลหนาแน่น Multi-panel และ Keyboard workflow |

ต้องตรวจอย่างน้อย:

- Mobile ประมาณ 360–390 px
- Tablet ประมาณ 768 px
- Desktop 1280 px ขึ้นไป
- Zoom 200% โดยไม่สูญเสียข้อมูลหรือ Action สำคัญ

ห้ามย่อ Desktop Table จนตัวหนังสืออ่านไม่ได้ ให้เลือกลำดับ Column, Scroll หรือเปลี่ยน Pattern ตามข้อมูล

---

## 8. Accessibility Standards

เป้าหมายขั้นต่ำ: WCAG 2.2 AA ใน Flow หลัก

- ใช้ Semantic HTML ก่อนเพิ่ม ARIA
- ทุก Control มี Accessible Name
- ใช้งาน Flow หลักด้วย Keyboard ได้
- Focus-visible ชัดเจนและลำดับ Focus ถูกต้อง
- Error ผูกกับ Field และประกาศต่อ Assistive Technology
- Contrast ผ่านเกณฑ์สำหรับข้อความและ UI Component
- ไม่ใช้สี เสียง หรือ Animation เพียงอย่างเดียวเพื่อสื่อความหมาย
- เคารพ `prefers-reduced-motion`
- Icon-only action มี Label
- Chart มีข้อความสรุปหรือตารางข้อมูลที่เทียบเท่าเมื่อจำเป็น

---

## 9. Component Catalog

ใช้ Storybook หรือหน้า `/design-system` ภายในระบบ โดยต้องแสดง:

- Token สี Typography Spacing Radius และ Shadow
- Component ทุก Variant, Size และ State
- Form ที่ถูกต้องและผิดพลาด
- Table พร้อม Loading, Empty, Error และข้อมูลยาว
- Dialog, Drawer, Toast และ Notification
- Page Pattern ตัวอย่าง
- Mobile, Tablet, Desktop
- Light/Dark mode หากระบบรองรับจริง

Component ใหม่ยังไม่ถือว่าเสร็จจนมีตัวอย่างใน Catalog และผ่าน Accessibility/Visual Check ที่เกี่ยวข้อง

---

## 10. Visual Regression Testing

ใช้ Playwright Screenshot Tests กับ Component และหน้าสำคัญอย่างน้อย:

- Login
- Dashboard Shell
- Expense list
- Expense create/edit form
- Notification Center
- Settings/Permission state
- Data table บน Desktop และ Mobile

กฎ Baseline:

- ห้ามอัปเดต Baseline เพื่อให้ Test ผ่านโดยไม่ตรวจภาพ Diff
- การเปลี่ยน Token หรือ Shared Component ต้องระบุ Screenshot ที่เปลี่ยนโดยตั้งใจ
- การเปลี่ยน Feature เฉพาะหน้าต้องไม่สร้าง Diff ในหน้าที่ไม่เกี่ยวข้อง
- เก็บ Before/After สำหรับการเปลี่ยน UI สำคัญใน PR หรือรายงานงาน

---

## 11. Change Control

### 11.1 ระดับการเปลี่ยนแปลง

| ระดับ | ตัวอย่าง | สิ่งที่ต้องทำ |
|---|---|---|
| Feature-local | เปลี่ยนข้อความหรือ Layout เฉพาะ Use case | ตรวจหน้าที่แก้และ Responsive |
| Shared Component | เปลี่ยน Button, Field, Table | ค้นหา Usage, ตรวจ Catalog และ Visual Regression |
| Token/System | เปลี่ยนสี ฟอนต์ Spacing Radius | ขออนุมัติระดับระบบและตรวจทุก Baseline ที่เกี่ยวข้อง |
| Pattern/UX | เปลี่ยนโครงสร้าง List/Form/Detail | บันทึก Decision และ Migration plan ของหน้าที่มีอยู่ |

### 11.2 กฎป้องกันงานเพี้ยน

- แยก PR/Task ที่แก้ Shared Component ออกจาก Feature เมื่อทำได้
- ห้ามแก้ Shared Component เพื่อแก้ปัญหาหน้าเดียวถ้า Component API ไม่ควรรองรับกรณีนั้น
- ห้ามสร้าง `Button2`, `NewTable` หรือ Component ชื่อชั่วคราวเพื่อเลี่ยงมาตรฐาน
- ทุก Exception ต้องมี Owner, เหตุผล และแผนยุบกลับเข้ามาตรฐาน
- ลบ Deprecated Variant หลัง Migration เสร็จและผ่าน Regression

---

## 12. AGENTS.md Rules

ให้นำส่วนนี้ไปวางใน `AGENTS.md` ของ Repository:

```md
## AVENZO UI/UX Rules

- Read `docs/AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md` before UI work.
- Read and follow `docs/AVENZO_ONE_UI_Mockup_First_Implementation_Guide_V1.md` for every visible UI change.
- Do not start production UI before the page mockup is owner-approved.
- Treat the approved mockup as the page-level source of truth; do not redesign or simplify it.
- If implementation constraints require a visible change, stop and request owner approval before coding the deviation.
- Use existing design tokens, shared components, and page patterns.
- Do not hard-code colors, spacing, border radius, or shadows in feature pages.
- Search the component library and usages before creating or changing a component.
- Do not duplicate buttons, fields, tables, dialogs, badges, or state UI.
- Preserve shared component APIs unless a system-wide change is approved.
- Every applicable page supports loading, empty, error, disabled, and permission states.
- Validate mobile, tablet, desktop, keyboard navigation, and visible focus.
- Run visual checks after UI changes.
- For shared component or token changes, report affected usages and screenshot diffs.
- Do not update screenshot baselines without reviewing and explaining the visual diff.
```

ปรับ Path ให้ตรงกับตำแหน่งไฟล์จริง แต่ห้ามตัดสาระสำคัญออก

---

## 13. UI Definition of Done

งาน UI ถือว่าเสร็จเมื่อ:

- [ ] Mockup ที่มีเวอร์ชันได้รับ Owner approval ก่อนเริ่ม Production UI
- [ ] มี Mockup-to-Production mapping และไม่มี Design deviation ที่ไม่ได้อนุมัติ
- [ ] Visual/Layout/Interaction ตรง Approved Mockup 100% ตามขอบเขตหน้า
- [ ] ใช้ Token และ Shared Component ที่มีอยู่
- [ ] ไม่มี Duplicate Component หรือ Hard-coded style ที่ไม่จำเป็น
- [ ] Primary action และลำดับข้อมูลชัดเจน
- [ ] State ที่เกี่ยวข้องครบ: Loading, Empty, Error, Success, Disabled, Permission
- [ ] Form รักษาข้อมูลเมื่อเกิด Error และ Validation เข้าใจได้
- [ ] Responsive ผ่าน Mobile, Tablet และ Desktop ที่กำหนด
- [ ] ใช้ Keyboard ได้และ Focus-visible ชัดเจน
- [ ] Contrast และ Accessible Name ผ่านการตรวจ
- [ ] Catalog/Story อัปเดตเมื่อ Component เปลี่ยน
- [ ] Visual Regression ผ่าน หรือ Diff ได้รับการตรวจและอธิบาย
- [ ] Owner ตรวจ Production visual parity และอนุมัติแล้ว
- [ ] Shared Component change มีรายการ Usage ที่ได้รับผลกระทบ
- [ ] Type check, lint และ Test ที่เกี่ยวข้องผ่าน

---

## 14. Prompt สำหรับสั่ง Codex แก้ UI โดยไม่ให้งานเพี้ยน

```text
ก่อนแก้ UI ให้อ่าน:
- AVENZO_ONE_Codex_Implementation_Starter_Plan_V7.md
- AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md
- AVENZO_ONE_UI_Mockup_First_Implementation_Guide_V1.md
- Approved Mockup เวอร์ชันล่าสุดของหน้าที่จะแก้
- AGENTS.md

จากนั้น:
1. ตรวจ Design Tokens, Shared Components, Page Patterns และ Component Catalog ที่มีอยู่
2. ค้นหา Usage ของ Component ที่คาดว่าจะเปลี่ยน
3. ระบุว่าการเปลี่ยนครั้งนี้เป็น Feature-local, Shared Component, Token/System หรือ Pattern/UX
4. เสนอไฟล์ที่จะแก้ ผลกระทบ และ Acceptance Criteria ก่อนลงมือ
5. จับคู่ทุก Section/Interaction ใน Approved Mockup กับ Production component ก่อนเขียน UI

กติกา:
- ห้าม Hard-code สี ระยะห่าง Radius หรือ Shadow ในหน้า Feature
- ห้ามเริ่ม Production UI หาก Mockup ยังไม่ผ่าน Owner approval
- ห้ามเปลี่ยน ย้าย ลด หรือเพิ่มองค์ประกอบจาก Approved Mockup โดยไม่ได้รับอนุมัติ
- หากติดข้อจำกัดทางเทคนิค ให้หยุดและเสนอ Deviation Request ก่อนแก้ดีไซน์
- ห้ามสร้าง Component ซ้ำ ถ้าเพิ่ม Variant หรือ Compose ของเดิมได้
- ห้ามเปลี่ยน Shared Component API โดยไม่รายงาน Usage ทั้งหมด
- ทุกหน้าต้องรองรับ State ที่เกี่ยวข้อง
- ตรวจ Mobile, Tablet, Desktop, Keyboard และ Focus-visible
- รัน Type check, lint, test และ Playwright visual check ที่เกี่ยวข้อง
- ห้ามอัปเดต Screenshot Baseline โดยไม่ตรวจและอธิบาย Diff

เมื่อเสร็จ ให้รายงาน:
- สิ่งที่เปลี่ยนและเหตุผล
- Component/Token ที่ใช้หรือเพิ่ม
- Usage ที่ได้รับผลกระทบ
- State และ Viewport ที่ตรวจ
- ผล Test และ Visual Diff
- หลักฐาน Side-by-side/Overlay เทียบกับ Approved Mockup
- สถานะ Owner production parity approval
- ข้อจำกัดหรือ Decision ที่ต้องอัปเดตใน Design System
```

---

## 15. ลำดับเริ่มต้นสำหรับ Repository ใหม่

1. ตรวจ Stack และเวอร์ชันจริงของ Next.js, Tailwind และ shadcn/ui
2. สร้าง Token Layer และ Typography
3. สร้าง App Shell และ Responsive Navigation
4. สร้าง Button, Field, Badge, Alert, Dialog และ State Components
5. สร้าง Form composition และ DataTable
6. สร้าง List, Form, Detail และ Dashboard Patterns
7. สร้าง Component Catalog
8. เพิ่ม Accessibility checks และ Playwright Screenshot Baselines
9. เพิ่มกฎใน `AGENTS.md`
10. เริ่ม Foundation Vertical Slice ตาม Implementation Plan V7

Design System ควรพัฒนาเท่าที่ Vertical Slice ต้องใช้ ไม่จำเป็นต้องสร้างทุก Component ล่วงหน้า แต่ Component ที่สร้างแล้วต้องเป็นมาตรฐานที่นำกลับมาใช้ซ้ำได้

---

## 16. Versioning และ Decision Log

เมื่อเปลี่ยน Token, Shared Component API, Page Pattern หรือกฎ UX อย่างมีนัยสำคัญ:

1. ระบุเหตุผลและปัญหาที่ต้องแก้
2. บันทึกผลกระทบและหน้า/Component ที่ต้อง Migration
3. เพิ่มหรืออัปเดต Visual Baseline หลังตรวจ Diff
4. อัปเดตเอกสารและ Changelog
5. เพิ่ม Version ตามระดับผลกระทบ

### Data Table Status Filter Bar

ใช้กับตารางงานจำนวนมากที่ผู้ใช้ต้องโฟกัสรายการซึ่งยังทำไม่เสร็จก่อน เช่น Rapid Entry:

- วางเหนือ Table โดยตรงและแยกจากคำสั่งแก้ไขหลายรายการ
- ใช้ Button Group แบบ Single-select พร้อมจำนวนในแต่ละสถานะ; Active เป็นพื้นดำ ตัวอักษรขาว
- ค่าเริ่มต้นควรเป็นสถานะที่ต้องดำเนินการต่อ ไม่ใช่ `ทั้งหมด` เมื่อจุดประสงค์ของหน้าคือปิดงานให้ครบ
- การกรองเปลี่ยนเฉพาะแถวที่มองเห็น ห้ามเปลี่ยนเลขลำดับ รหัสประจำรายการ ค่าที่กรอก หรือรายการที่เลือกไว้
- Selection ต้องคงอยู่ในชุดข้อมูลหลักเมื่อเปลี่ยนตัวกรอง แต่ Bulk action ค่าเริ่มต้นต้องใช้เฉพาะรายการที่มองเห็นและเลือกในสถานะปัจจุบัน เพื่อป้องกันแก้รายการที่ซ่อนโดยไม่ตั้งใจ
- หากมี Selection จากสถานะอื่น ต้องแจ้งจำนวนแยกอย่างชัดเจนและไม่นำมารวมอัตโนมัติ; ผู้ใช้ต้องสั่ง `รวมรายการที่ซ่อน` เองก่อน และ Confirmation Dialog ต้องยืนยันจำนวนรวมอีกครั้ง
- ต้องมีคำสั่ง `ล้างรายการที่ซ่อน` โดยไม่กระทบ Selection ที่มองเห็น และ Bulk command ต้อง Snapshot รายการเป้าหมายก่อนเปิด Confirmation Dialog
- แสดงจำนวน `ที่เห็น / ทั้งหมด` และมี Empty state ที่บอกว่าข้อมูลยังอยู่ครบ
- ปุ่มสูง 32px, ใช้ `aria-pressed`, Focus-visible และใช้งานด้วย Keyboard ได้
- ตารางปิดงานแบบ Dense สามารถสลับรายการ `พร้อมสร้าง` ไว้บนหรือล่างของมุมมอง `ทั้งหมด` ได้ แต่ต้องเป็น Presentation order เท่านั้น
- คำสั่งสลับบน/ล่างใช้ Text action แบบไม่มีพื้นและไม่มีกรอบ; แสดง Hover/Focus เท่านั้น พร้อมไอคอนลูกศรและข้อความที่บอกปลายทางของการกดครั้งถัดไป
- เมื่อระบบจัดลำดับให้อัตโนมัติ ต้องแจ้ง Toast และมี Undo; Undo ต้องคืนลำดับเดิมโดยไม่ย้อนข้อมูลที่ผู้ใช้เพิ่งกรอก
- ห้าม Sort ด้วยการแก้ Array หลัก เพราะจะทำให้ Row identity, Selection, Draft และ Bulk action คลาดเคลื่อน

---

## Changelog

### V1.0 — 5 สิงหาคม 2026

- กำหนด Brand Foundation และ UX Principles ของ AVENZO
- เพิ่ม Design Token Policy และค่าเริ่มต้นของสี Typography Spacing Radius
- กำหนดมาตรฐาน Button, Form, DataTable, Badge, Dialog และ System States
- เพิ่ม Page Patterns, Responsive และ Accessibility Standards
- เพิ่ม Component Catalog, Visual Regression และ Change Control
- เพิ่มกฎสำหรับ `AGENTS.md`, UI Definition of Done และ Prompt สำหรับ Codex

### V1.1 — 7 สิงหาคม 2026

- กำหนด Font กลางแบบสองภาษา: Noto Sans Thai + Inter
- กำหนด Button Interaction กลาง: Hover, Focus-visible, Active, Disabled และ Reduced Motion

### V1.2 — 8 สิงหาคม 2026

- กำหนดความสูงมาตรฐานของปุ่มปกติและปุ่ม Compact
- กำหนด Pattern `form-card-with-footer` ให้ Action หลักของการ์ดคู่กันอยู่แนวฐานเดียวกัน

### V1.3 — 15 สิงหาคม 2026

- เพิ่ม Mandatory Mockup-First Page Gate สำหรับทุก Visible UI change
- กำหนด Approved Mockup เป็น Page-level Source of Truth และห้ามเปลี่ยนดีไซน์เอง
- เพิ่ม Visual Parity และ Owner production approval เข้า UI Definition of Done
- เชื่อมคู่มือ `AVENZO_ONE_UI_Mockup_First_Implementation_Guide_V1.md`

### V1.4 — 17 สิงหาคม 2026

- เพิ่มมาตรฐาน `Master Data Picker Dialog` สำหรับ Brand, Category และ Tags
- กำหนด Badge `ใช้ล่าสุด` สีแดง และ `ใช้บ่อย` สีดำ พร้อมลำดับความสำคัญ
- กำหนด `IconInfoHexagon` 18px และ Tooltip ด้านขวาที่รองรับ Mouse และ Keyboard
- แยก Pattern เลือก Master Data ออกจากงานแก้ Price, Cost และ Stock ระดับ SKU
- เพิ่มมาตรฐาน Bulk SKU Edit Dialog สำหรับ Segmented control, Combobox, Preview table, Scrollbar และ Footer

### V1.5 — 18 สิงหาคม 2026

- เพิ่มมาตรฐาน `Master Data Manager Dialog` สำหรับ Category, Brand และ Tags จาก UI ที่ผ่านการตรวจแล้ว
- กำหนดโครงสร้าง Header/Scrollable Body/Fixed Footer, รายการแก้ชื่อและเก็บถาวร, Bulk add และ Permission notice
- กำหนดให้ Manager ที่เปิดจาก Picker อยู่ Layer สูงกว่า และอัปเดตตัวเลือกใน Picker ทันทีหลังบันทึก
- กำหนด Accessibility, Validation, Trusted command และ Audit Log เป็นส่วนบังคับของ Component contract
### V1.6 — 18 สิงหาคม 2026

- เพิ่มมาตรฐาน `Tag Badge` สำหรับ Data Table, Expanded SKU row และ Quick View
- กำหนดสีแบบ deterministic, ไม่ซ้ำภายในแถวจนกว่าชุดสีจะครบ และรองรับ Light/Dark Mode ผ่าน Semantic Tokens
- กำหนดให้ Badge เรียงแถวเดียว คงความกว้างตามข้อความ และไม่ถูกบีบเมื่อ Column แคบ
- กำหนด Density, Overflow และ Accessibility contract สำหรับ Tag Badge

### V1.7 — 21 สิงหาคม 2026

- เพิ่มมาตรฐาน Numbered Form Section สำหรับหน้าที่มีลำดับงาน
- กำหนด Label, Required indicator และ Info icon ให้อยู่ในแถวเดียวกัน
- ล็อกขนาด Section number, Heading, Description, Label และ Form Info tooltip ตาม Product Creation ที่ผ่าน Owner review
- กำหนดคำอธิบาย Section ให้อยู่ต่อจาก Heading ในวงเล็บ และตัดขึ้นบรรทัดใหม่ได้เฉพาะเมื่อพื้นที่แนวนอนไม่พอ

### V1.8 — 21 สิงหาคม 2026

- เพิ่มมาตรฐาน `Data Table Status Filter Bar`
- กำหนดให้การกรองไม่เปลี่ยน Selection, Row identity หรือขอบเขตคำสั่งแบบกลุ่ม
- กำหนด Active, Count, Empty state และ Keyboard contract สำหรับตารางงานแบบ Dense

### V1.9 — 21 สิงหาคม 2026

- เพิ่มมาตรฐาน Presentation-only Ready-last ordering สำหรับ Data Table
- กำหนด Toast/Undo และห้ามเปลี่ยน Row identity, Draft value หรือ Selection ขณะจัดลำดับ

### V1.10 — 21 สิงหาคม 2026

- เพิ่มมาตรฐาน `Safe Selection Scope` สำหรับตารางที่มีตัวกรองสถานะ
- Bulk action ใช้เฉพาะ Selection ที่มองเห็นเป็นค่าเริ่มต้น และต้องขอคำยืนยันอย่างชัดเจนก่อนรวม Selection จากสถานะอื่น
- กำหนด Hidden-selection warning, Clear hidden selection และ Snapshot เป้าหมายก่อนยืนยันคำสั่ง

### V1.11 — 22 สิงหาคม 2026

- เพิ่มมาตรฐาน `Expiring Reservation Status` สำหรับงานที่ล็อกทรัพยากรชั่วคราว
- เวลาหมดอายุต้องยึด `expires_at` จาก Server เท่านั้น; Auto-save ห้ามต่ออายุโดยเงียบ
- แสดงเวลาคงเหลือแบบ Compact, เตือนเมื่อเหลือ 30 และ 10 นาที และใช้ Danger state เมื่อหมดอายุ
- เมื่อหมดอายุ ข้อมูล Draft ต้องไม่หาย แต่ Action ขั้นสุดท้ายต้องถูกปิดพร้อมบอกวิธีจองใหม่
- Browser Draft และ Server Reservation ต้องสื่อสารแยกกันชัดเจน: Draft คือการกู้ข้อมูล ส่วน Reservation คือสิทธิ์ใช้รหัสชั่วคราว
- Browser Draft ที่บันทึกแบบ Debounce ต้องเขียนค่าล่าสุดทันทีเมื่อหน้าเข้าสู่ Background หรือเกิด `pagehide`; การ Flush นี้เป็น Local-only และห้ามต่ออายุ Server Reservation
