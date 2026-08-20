'use client'

export default function ProductSkuError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="content product-workspace-page">
    <div className="operations-empty-state danger" role="alert"><span aria-hidden="true">!</span><div><h3>โหลด Product/SKU ไม่สำเร็จ</h3><p>ไม่แสดงรายละเอียดภายในของระบบ กรุณาลองใหม่อีกครั้ง</p><button className="button" type="button" onClick={reset}>ลองใหม่</button></div></div>
  </main>
}
