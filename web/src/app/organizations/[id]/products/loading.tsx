export default function ProductSkuLoading() {
  return <main className="content product-workspace-page" aria-busy="true" aria-label="กำลังโหลด Product และ SKU">
    <div className="product-loading-header"><span /><span /><span /></div>
    <div className="operations-card-list columns-3"><span className="product-loading-card" /><span className="product-loading-card" /><span className="product-loading-card" /></div>
    <div className="product-loading-table"><span /><span /><span /><span /></div>
  </main>
}
