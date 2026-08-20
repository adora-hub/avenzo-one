import Link from 'next/link'
import { IconBuildingWarehouse, IconHome, IconLayoutGrid } from '@tabler/icons-react'

export function InventoryHeaderBreadcrumb({ organizationId }: { organizationId: string }) {
  return <nav className="product-header-breadcrumb" aria-label="Breadcrumb">
    <Link href="/dashboard"><IconHome aria-hidden="true" /><span>หน้าหลัก</span></Link><span aria-hidden="true">›</span>
    <Link href={`/organizations/${organizationId}`}><IconLayoutGrid aria-hidden="true" /><span>พื้นที่ทำงาน</span></Link><span aria-hidden="true">›</span>
    <span aria-current="page"><IconBuildingWarehouse aria-hidden="true" /><span>คลังสินค้าและสต็อก</span></span>
  </nav>
}
