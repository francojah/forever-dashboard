import { workspaceCrud, str, num, month } from '@/lib/faro/crud'
export const dynamic = 'force-dynamic'
const h = workspaceCrud('extra_costs', { month, category: str(40), description: str(200), amount: num }, 'month')
export const GET = h.GET
export const POST = h.POST
export const PATCH = h.PATCH
export const DELETE = h.DELETE
