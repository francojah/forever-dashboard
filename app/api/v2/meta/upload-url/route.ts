import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'

/** URL firmada para que el navegador suba el archivo directo a Supabase Storage. */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const { filename, size } = await req.json().catch(() => ({})) as { filename?: string; size?: number }
  if (!filename) return Response.json({ error: 'Falta el archivo' }, { status: 400 })
  if (size && size > 1024 * 1024 * 1024) return Response.json({ error: 'Máximo 1 GB por archivo' }, { status: 400 })
  const safe = filename.normalize('NFD').replace(/[^\w.\-]+/g, '_').slice(-80)
  const path = `${ctx.workspace.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`
  const { data, error } = await svc().storage.from('faro-creatives').createSignedUploadUrl(path)
  if (error || !data) return Response.json({ error: error?.message || 'No se pudo preparar la subida' }, { status: 500 })
  return Response.json({ path: data.path, token: data.token, signedUrl: data.signedUrl })
}
