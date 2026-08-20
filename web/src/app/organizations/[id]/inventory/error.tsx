'use client'
export default function InventoryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="content inventory-workspace-page"><div className="operations-empty-state danger" role="alert"><span aria-hidden="true">!</span><div><h3>โหลด Warehouse/Stock ไม่สำเร็จ</h3><p>ระบบไม่แสดงรายละเอียดภายใน กรุณาลองใหม่</p><button className="button" type="button" onClick={reset}>ลองใหม่</button></div></div></section>
}
