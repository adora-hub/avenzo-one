import { redirect } from 'next/navigation'
import { ApplicationShell } from '@/app/components/application-shell'
import { OperationsCardList, OperationsPageHeader, OperationsStatusBadge, OperationsSummaryCard } from '@/app/components/operations-ui'
import { uuidPattern } from '@/lib/foundation/contracts'
import { createFoundationReadRepository } from '@/lib/foundation/server-read'
import type { InventoryBalanceReadModel, StockMovementReadModel, WarehouseReadModel } from '@/lib/foundation/repositories'
import type { OrganizationAccessSummary } from '@/lib/organization-access'
import { createClient } from '@/lib/supabase/server'
import { InventoryWorkspace } from './inventory-workspace'

type SearchParams = Record<string, string | string[] | undefined>
type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }
const warehouseStatuses = new Set(['', 'active', 'inactive', 'archived'])
const movementTypes = new Set(['', 'receive', 'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out'])

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? '' : value ?? '' }
function optionalUuid(value: string | string[] | undefined) {
  const candidate = first(value)
  return uuidPattern.test(candidate) ? candidate : ''
}

export default async function InventoryPage({ params, searchParams }: Props) {
  const [{ id: organizationId }, query] = await Promise.all([params, searchParams])
  const requestedView = first(query.view)
  const view = requestedView === 'balances' || requestedView === 'ledger' ? requestedView : 'warehouses'
  const search = first(query.q).trim().slice(0, 160)
  const requestedStatus = first(query.status).toLowerCase()
  const status = warehouseStatuses.has(requestedStatus) ? requestedStatus : ''
  const requestedMovement = first(query.movement).toLowerCase()
  const movement = movementTypes.has(requestedMovement) ? requestedMovement : ''
  const branchId = optionalUuid(query.branch)
  const warehouseId = optionalUuid(query.warehouse)
  const locationId = optionalUuid(query.location)
  const skuId = optionalUuid(query.sku)
  const initialDialog = first(query.action) === 'adjust' && skuId ? 'adjust' as const : null
  const selectedWarehouseId = optionalUuid(query.detail)
  const cursor = first(query.cursor) || null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const [organizationResult, accessResult, platformAdminResult] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', organizationId).maybeSingle(),
    supabase.rpc('current_user_organization_access', { p_organization_id: organizationId }),
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
  ])
  const organization = organizationResult.data
  const access = (accessResult.data?.[0] ?? null) as OrganizationAccessSummary | null
  if (!organization || !access || access.membership_status !== 'active') redirect('/dashboard')
  const permissions = new Set(access.permissions.map((item) => item.code))
  const canReadWarehouse = permissions.has('warehouse.read')
  const canReadInventory = permissions.has('inventory.read')
  const canReadProduct = permissions.has('product.read')
  const canManageWarehouse = permissions.has('warehouse.manage')
  const canReceive = permissions.has('inventory.receive')
  const canAdjust = permissions.has('inventory.adjust')
  const canTransfer = permissions.has('inventory.transfer')
  const isPlatformAdmin = platformAdminResult.data?.status === 'active'
  const canReadView = view === 'warehouses'
    ? canReadWarehouse
    : canReadInventory && canReadWarehouse && canReadProduct

  if (!canReadView) return <ApplicationShell email={user.email ?? ''} isPlatformAdmin={isPlatformAdmin} section="workspace" organizationId={organizationId} organizationName={organization.name}>
    <section className="content inventory-workspace-page">
      <OperationsPageHeader eyebrow="Phase 2.0.6 · Warehouse/Stock" title="Warehouse & Stock" description="คลัง ตำแหน่ง ยอดคงเหลือ และ Movement Ledger" />
      <div className="operations-empty-state warning" role="alert"><span aria-hidden="true">!</span><div><h3>ไม่มีสิทธิ์อ่านข้อมูลส่วนนี้</h3><p>ต้องได้รับสิทธิ์ {view === 'warehouses' ? 'warehouse.read' : 'inventory.read, warehouse.read และ product.read'} ก่อน</p></div></div>
    </section>
  </ApplicationShell>

  const repository = await createFoundationReadRepository()
  const listPromise = view === 'warehouses'
    ? repository.listWarehouses({ organizationId, branchId: branchId || undefined, status: status || undefined, search, cursor, pageSize: 20 })
    : view === 'balances'
      ? repository.listInventoryBalances({ organizationId, branchId: branchId || undefined, warehouseId: warehouseId || undefined, locationId: locationId || undefined, skuId: skuId || undefined, cursor, pageSize: 20 })
      : repository.listStockMovements({ organizationId, branchId: branchId || undefined, warehouseId: warehouseId || undefined, locationId: locationId || undefined, skuId: skuId || undefined, movementType: movement || undefined, cursor, pageSize: 20 })
  const [listResult, warehouseOptionsResult, locations, skuOptionsResult, branchesResult, selectedWarehouse] = await Promise.all([
    listPromise,
    canReadWarehouse ? repository.listWarehouses({ organizationId, pageSize: 100 }) : Promise.resolve({ items: [], nextCursor: null }),
    canReadWarehouse ? repository.listLocations({ organizationId, pageSize: 100 }) : Promise.resolve([]),
    repository.listSkus({ organizationId, status: 'active', pageSize: 100 }),
    supabase.from('branches').select('id, code, name, status').eq('organization_id', organizationId).eq('status', 'active').order('code'),
    selectedWarehouseId && canReadWarehouse ? repository.getWarehouse({ organizationId, warehouseId: selectedWarehouseId }) : Promise.resolve(null),
  ])
  const warehouses = view === 'warehouses' ? listResult.items as WarehouseReadModel[] : []
  const balances = view === 'balances' ? listResult.items as InventoryBalanceReadModel[] : []
  const movements = view === 'ledger' ? listResult.items as StockMovementReadModel[] : []
  const totalOnHand = balances.reduce((sum, item) => sum + item.onHand, 0)
  const lowStockCount = balances.filter((item) => item.available > 0 && item.available <= 5).length
  const outOfStockCount = balances.filter((item) => item.available === 0).length

  return <ApplicationShell email={user.email ?? ''} isPlatformAdmin={isPlatformAdmin} section="workspace" organizationId={organizationId} organizationName={organization.name}>
    <section className="content inventory-workspace-page">
      <OperationsPageHeader eyebrow="Phase 2.0.6 · Foundation Vertical Slice" title="Warehouse & Stock" description={`ดูแลคลัง ยอดคงเหลือ และ Movement Ledger ของ ${organization.name} โดยไม่เขียน Balance จาก UI โดยตรง`} actions={<OperationsStatusBadge tone={canManageWarehouse || canReceive || canAdjust || canTransfer ? 'success' : 'info'}>{canManageWarehouse || canReceive || canAdjust || canTransfer ? 'มีสิทธิ์ดำเนินการ' : 'อ่านอย่างเดียว'}</OperationsStatusBadge>} />
      <OperationsCardList label="สรุป Warehouse และ Stock" columns={3}>
        <OperationsSummaryCard label="รายการในหน้านี้" value={listResult.items.length} description="สูงสุด 20 รายการต่อหน้า" />
        <OperationsSummaryCard label="On hand ในหน้านี้" value={view === 'balances' ? totalOnHand.toLocaleString('th-TH') : '—'} description="Allocated = 0 ใน Phase 2.0" />
        <OperationsSummaryCard label="แจ้งเตือน Stock" value={view === 'balances' ? lowStockCount + outOfStockCount : '—'} description={view === 'balances' ? `ใกล้หมด ${lowStockCount} · หมด ${outOfStockCount}` : 'ดูได้ในมุมมองยอดคงเหลือ'} />
      </OperationsCardList>
      <section className="inventory-workspace-panel" aria-label="Warehouse และ Stock workspace">
        <InventoryWorkspace organizationId={organizationId} view={view} search={search} status={status} movement={movement} branchId={branchId} warehouseId={warehouseId} locationId={locationId} skuId={skuId} initialDialog={canAdjust ? initialDialog : null} warehouses={warehouses} balances={balances} movements={movements} warehouseOptions={warehouseOptionsResult.items} locations={locations} skuOptions={skuOptionsResult.items} branches={branchesResult.data ?? []} selectedWarehouse={selectedWarehouse} nextCursor={listResult.nextCursor} canManageWarehouse={canManageWarehouse} canReceive={canReceive} canAdjust={canAdjust} canTransfer={canTransfer} />
      </section>
    </section>
  </ApplicationShell>
}
