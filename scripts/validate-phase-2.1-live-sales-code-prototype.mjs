import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = path.join(root, "docs", "mockups", "phase-2.1-live-sales-code-reservation.html");
const html = fs.readFileSync(file, "utf8");

const checks = {
  standaloneHtml: /<!doctype html>/i.test(html) && /<script>[\s\S]*?<\/script>/.test(html),
  prototypeOnlyNotice: /Interaction Prototype เท่านั้น/.test(html) && /ไม่จองรหัส/.test(html),
  reservationAction: /id="openReserveModal"/.test(html) && /id="reserveModal"/.test(html),
  reservationRange: /id="prefixInput"/.test(html) && /id="startInput"/.test(html) && /id="countInput"/.test(html) && /id="digitsInput"/.test(html),
  editableBatchDetails: /id="editBatchButton"/.test(html) && /id="editBatchModal"/.test(html) && /id="saveBatchDetails"/.test(html),
  immutableReservationDetails: /ล็อกเพื่อความปลอดภัย/.test(html) && /ผู้สร้าง และเวลาสร้างแก้ไขไม่ได้/.test(html),
  seventyCodePreview: /B001–B070/.test(html) && /value="70"/.test(html),
  quickCreate: /id="quickCreateForm"/.test(html) && /บันทึกและสร้างรายการถัดไป/.test(html),
  explicitSaveDestinations: /บันทึกและกลับ Products/.test(html) && /submitQuick\("products"\)/.test(html) && /submitQuick\("next"\)/.test(html),
  initialStockColumn: /<th>สต็อกเริ่มต้น<\/th>/.test(html) && /item\.quantity\.toLocaleString\("th-TH"\)/.test(html),
  salesCodePrimary: /Sales Code ที่ระบบเตรียมไว้/.test(html) && /id="reservedCode"/.test(html),
  hiddenInternalIdentityRule: /สร้าง Product ID และ SKU ID ภายใน/.test(html) && /resolve Sales Code ไปเป็น SKU ID/.test(html),
  atomicPolicy: /จองแบบ Atomic/.test(html) && /Organization/.test(html),
  codeStates: /ใช้แล้ว/.test(html) && /รหัสถัดไป/.test(html) && /จองไว้/.test(html) && /ข้าม/.test(html),
  noReusePolicy: /รหัสที่เผยแพร่แล้วห้ามนำกลับมาใช้/.test(html),
  consecutiveAllocation: /const nextNumber = \(\) =>/.test(html) && /function submitQuick\(destination\)/.test(html),
  uniquenessFriendlyFlow: /usedCodes/.test(html) && /state\.skipped/.test(html),
  safeTextLimits: /maxlength="120"/.test(html) && /maxlength="240"/.test(html) && /maxlength="100"/.test(html),
  numericLimits: /max="99999999"/.test(html) && /max="999999"/.test(html) && /max="500"/.test(html),
  accessibleDialog: /role="dialog"/.test(html) && /aria-modal="true"/.test(html) && /event\.key (?:===|!==) "Escape"/.test(html),
  responsive: /@media \(max-width: 900px\)/.test(html) && /@media \(max-width: 650px\)/.test(html),
  reducedMotion: /prefers-reduced-motion/.test(html),
  themeContract: /prefers-color-scheme: dark/.test(html) && /color-scheme: light dark/.test(html),
  noExternalNetwork: !/(fetch\s*\(|XMLHttpRequest|supabase|https?:\/\/)/i.test(html),
};

const failed = Object.entries(checks).filter(([, passed]) => !passed);
for (const [name, passed] of Object.entries(checks)) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
console.log(`\n${Object.keys(checks).length - failed.length}/${Object.keys(checks).length} checks passed`);
if (failed.length) process.exit(1);
