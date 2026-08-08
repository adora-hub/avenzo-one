import Link from 'next/link'

export default function StripeCheckoutSuccessPage() {
  return <main className="shell"><section className="auth-card checkout-result-card">
    <div className="eyebrow">STRIPE TEST MODE</div>
    <h1>Stripe รับรายการแล้ว</h1>
    <p>ระบบกำลังรอ Webhook ที่ตรวจสอบลายเซ็นแล้วเพื่อยืนยันผล การกลับมาหน้านี้เพียงอย่างเดียวยังไม่ถือว่าชำระสำเร็จ</p>
    <div className="info-message"><span aria-hidden="true">i</span><p>กลับไปหน้า Billing แล้วเปิดประวัติ Payment เพื่อตรวจสถานะล่าสุด</p></div>
    <Link className="button" href="/platform-admin/billing">กลับหน้า Billing</Link>
  </section></main>
}
