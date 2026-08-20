# Phase 1.2.2.3 — Session Expiry Warning UI

## เป้าหมาย

แสดงคำเตือนก่อน Session หมดอายุจากข้อมูลนโยบายฝั่ง Server พร้อมเวลานับถอยหลังและปุ่มใช้งานต่อสำหรับ Idle Timeout

## พฤติกรรม

- ใช้ `server_time` จาก Supabase เป็นฐาน เพื่อลดความคลาดเคลื่อนจากนาฬิกาบนอุปกรณ์
- เลือกเส้นตายที่มาถึงก่อนระหว่าง Idle Timeout และ Absolute Timeout
- Idle Timeout: ผู้ใช้กด **ใช้งานต่อ** เพื่อส่ง Heartbeat และต่อเวลาได้
- Absolute Timeout: แจ้งให้บันทึกงาน เพราะอายุสูงสุดของ Session ต่อเวลาไม่ได้
- Session หมดอายุหรือถูกเพิกถอน: แสดงสถานะชัดเจน แต่ยังไม่บังคับ Logout ใน Phase นี้
- Dialog ใช้ `alertdialog`, `aria-live` และรองรับหน้าจอขนาดเล็ก

## ขอบเขตความปลอดภัย

- ไม่มี Secret Key ใน Browser
- ไม่เชื่อเวลาจาก Client เพียงอย่างเดียว
- ไม่แก้ Absolute Expiry ผ่าน Heartbeat
- การบังคับออกจากระบบและ Redirect จะทำใน Phase ถัดไป

## การทดสอบ

1. Contract test การเลือก Idle/Absolute Expiry และการคำนวณจาก Server time
2. Contract test สถานะหมดอายุ/เพิกถอน
3. ตรวจ UI accessibility และยืนยันว่าไม่มี Forced Logout ใน Phase นี้
4. TypeScript, Regression tests และ Production build
