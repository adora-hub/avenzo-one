import { LiveSaleReservationUi } from './live-sale-reservation-ui'

type Props = {
  organizationId: string
  organizationName: string
  canManage: boolean
}

export function LiveSalePageShell({ organizationId, organizationName, canManage }: Props) {
  return <LiveSaleReservationUi organizationId={organizationId} organizationName={organizationName} canManage={canManage} />
}
