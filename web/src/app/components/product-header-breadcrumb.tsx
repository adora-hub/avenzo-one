import Link from 'next/link'

type ProductHeaderBreadcrumbProps = {
  organizationId: string
  currentPage?: 'products' | 'create-product'
}

function HomeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-7 9 7v9H3zM9 20v-6h6v6" /></svg>
}

function WorkspaceIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v5H4zM14 15h6v5h-6z" /></svg>
}

function ProductIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v13H4zM8 3v6M16 3v6M4 10h16" /></svg>
}

function CreateIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
}

export function ProductHeaderBreadcrumb({ organizationId, currentPage = 'products' }: ProductHeaderBreadcrumbProps) {
  const productsHref = `/organizations/${organizationId}/products`

  return <nav className="product-header-breadcrumb" aria-label="Breadcrumb">
    <Link href="/dashboard"><HomeIcon /><span>หน้าหลัก</span></Link><span aria-hidden="true">›</span>
    <Link href={`/organizations/${organizationId}`}><WorkspaceIcon /><span>พื้นที่ทำงาน</span></Link><span aria-hidden="true">›</span>
    {currentPage === 'products'
      ? <span aria-current="page"><ProductIcon /><span>สินค้า</span></span>
      : <><Link href={productsHref}><ProductIcon /><span>สินค้า</span></Link><span aria-hidden="true">›</span><span aria-current="page"><CreateIcon /><span>สร้างสินค้า</span></span></>}
  </nav>
}
