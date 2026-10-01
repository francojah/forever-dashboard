import type { Metadata } from 'next'
import { currentAdmin } from '@/lib/cambios/adminAuth'
import AdminGate from './AdminGate'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Panel de cambios — Forever Basics', robots: { index: false, follow: false } }

export default async function CambiosAdminPage() {
  const user = await currentAdmin()
  return <AdminGate initialUser={user} />
}
