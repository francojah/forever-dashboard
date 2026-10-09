import { workspaceCrud, str, num, date } from '@/lib/faro/crud'
export const dynamic = 'force-dynamic'
const h = workspaceCrud('fixed_costs', { name: str(120), category: str(40), amount: num, valid_from: date, valid_to: date }, 'valid_from')
export const GET = h.GET
export const POST = h.POST
export const PATCH = h.PATCH
export const DELETE = h.DELETE
