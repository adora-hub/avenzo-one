# Phase 1.3.6.1 — Design Token Foundation

## เป้าหมาย

กำหนดชุดสีส่วนกลางของ AVENZO ONE ให้ Light Mode และ Dark Mode ใช้แหล่งข้อมูลเดียวกัน และแยกบทบาทสีของ Sidebar, พื้นหลัง, ตัวอักษร และปุ่มออกจากกันอย่างชัดเจน

## Light Mode

| บทบาท | สี |
| --- | --- |
| Sidebar หลัก | `#001F24` |
| ตัวอักษร Sidebar หลัก | `#F2F6FA` |
| Hover Sidebar หลัก | `#F2F6FA` / ตัวอักษร `#001F24` |
| Sidebar รอง | `#F2F6FA` |
| ตัวอักษร Sidebar รอง | `#001F24` |
| Hover Sidebar รอง | `#001F24` / ตัวอักษร `#F2F6FA` |
| พื้นหลังหน้า | `#FFFFFF` |
| ตัวอักษรหลัก | `#21211E` |
| ตัวอักษรรอง | `#4F4F4D` |
| ปุ่มหลัก / Hover | `#123E6B` / `#00478F` |
| ปุ่มรอง / Hover | `#516375` / `#738CA6` |

## Dark Mode

| บทบาท | สี |
| --- | --- |
| Sidebar หลัก | `#000000` |
| ตัวอักษร Sidebar หลัก | `#FFFFFF` |
| Hover Sidebar หลัก | `#1A1A1A` / ตัวอักษร `#FFFFFF` |
| Sidebar รอง | `#1A1A1A` |
| ตัวอักษร Sidebar รอง | `#FFFFFF` |
| Hover Sidebar รอง | `#000000` / ตัวอักษร `#FFFFFF` |
| พื้นหลังหน้า | `#000000` |
| พื้นผิว Card และ Input | `#1A1A1A` |
| ตัวอักษรหลัก | `#FFFFFF` |
| ตัวอักษรรอง | `#E6E6E6` |
| ปุ่มหลัก / Hover | `#1A1A1A` / `#000000` |
| ปุ่มรอง / Hover | `#5E5E5E` / `#4A4A4A` |

## โครงสร้าง Token

1. `--palette-*` คือค่าสีดิบที่ได้รับอนุมัติ ห้าม Component เรียกโดยตรงถ้าไม่จำเป็น
2. Token เชิงความหมาย เช่น `--sidebar-primary-background`, `--text-primary`, `--button-primary-background` คือ API กลางสำหรับ Component
3. Token เดิม เช่น `--ink`, `--canvas`, `--brand` เป็น Compatibility Alias ระหว่างย้ายหน้าจอเก่า
4. สีสถานะ Success, Warning และ Danger แยกจากสีแบรนด์ เพื่อไม่ทำให้ความหมายของสถานะผิดเพี้ยน

## ขอบเขต Phase นี้

- เพิ่มและเปิดใช้ Token กลาง
- เชื่อม App Rail, Context Sidebar และปุ่มมาตรฐานกับ Token ใหม่
- รักษา Compatibility ของหน้าจอเดิม
- การไล่แก้สีที่เขียนแบบ Hard-coded ทุกหน้าจะทำต่อใน Phase 1.3.6.2 และ 1.3.6.3
