import { redirect } from 'next/navigation'

type Props = { params: Promise<{ id: string }> }

export default async function LiveSalePage({ params }: Props) {
  const { id: organizationId } = await params
  redirect(`/organizations/${organizationId}/products/live-sale/rapid-entry`)
}
