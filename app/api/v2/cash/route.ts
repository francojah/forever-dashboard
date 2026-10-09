import { workspaceCrud, str, num, date, oneOf } from '@/lib/faro/crud'
export const dynamic = 'force-dynamic'
const h = workspaceCrud('cash_movements', { date, type: oneOf('compra_mercaderia', 'retiro', 'aporte', 'otro'), description: str(200), amount: num }, 'date')
export const GET = h.GET
export const POST = h.POST
export const PATCH = h.PATCH
export const DELETE = h.DELETE
