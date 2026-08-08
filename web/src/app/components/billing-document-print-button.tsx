'use client'

export function BillingDocumentPrintButton() {
  return <button className="button" type="button" onClick={() => window.print()}>พิมพ์เอกสาร</button>
}
