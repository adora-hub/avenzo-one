import Link from 'next/link'

export default function StripeCheckoutCancelPage() {
  return <main className="shell"><section className="auth-card checkout-result-card">
    <div className="eyebrow">STRIPE TEST MODE</div>
    <h1>ยังไม่ได้ชำระเงิน</h1>
    <p>คุณออกจาก Checkout ก่อนเสร็จ รายการ Invoice ยังไม่ถูกเปลี่ยนเป็นชำระแล้ว และสามารถทดลองใหม่ได้</p>
    <Link className="button secondary" href="/platform-admin/billing">กลับหน้า Billing</Link>
  </section></main>
}
