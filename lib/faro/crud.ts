import { apiContext, canEdit } from './context'
import { svc } from './db'

/**
 * CRUD genérico para tablas con workspace_id (fijos, costos puntuales, caja).
 * `fields` = columnas editables y su validación.
 */
export function workspaceCrud(table: string, fields: Record<string, (v: unknown) => unknown>, order = 'created_at') {
  const clean = (body: Record<string, unknown>) => {
    const row: Record<string, unknown> = {}
    for (const [k, fn] of Object.entries(fields)) if (k in body) row[k] = fn(body[k])
    return row
  }
  return {
    async GET() {
      const ctx = await apiContext()
      if (ctx instanceof Response) return ctx
      const { data, error } = await svc().from(table).select('*').eq('workspace_id', ctx.workspace.id).order(order, { ascending: false })
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ rows: data || [] })
    },
    async POST(req: Request) {
      const ctx = await apiContext()
      if (ctx instanceof Response) return ctx
      if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
      const body = await req.json().catch(() => ({}))
      let row: Record<string, unknown>
      try { row = clean(body) } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }) }
      const { data, error } = await svc().from(table).insert({ ...row, workspace_id: ctx.workspace.id }).select('*').single()
      if (error) return Response.json({ error: error.message }, { status: 400 })
      return Response.json({ ok: true, row: data })
    },
    async PATCH(req: Request) {
      const ctx = await apiContext()
      if (ctx instanceof Response) return ctx
      if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
      const body = await req.json().catch(() => ({})) as Record<string, unknown>
      if (!body.id) return Response.json({ error: 'Falta id' }, { status: 400 })
      let row: Record<string, unknown>
      try { row = clean(body) } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }) }
      const { error } = await svc().from(table).update(row).eq('id', String(body.id)).eq('workspace_id', ctx.workspace.id)
      if (error) return Response.json({ error: error.message }, { status: 400 })
      return Response.json({ ok: true })
    },
    async DELETE(req: Request) {
      const ctx = await apiContext()
      if (ctx instanceof Response) return ctx
      if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
      const id = new URL(req.url).searchParams.get('id')
      if (!id) return Response.json({ error: 'Falta id' }, { status: 400 })
      const { error } = await svc().from(table).delete().eq('id', id).eq('workspace_id', ctx.workspace.id)
      if (error) return Response.json({ error: error.message }, { status: 400 })
      return Response.json({ ok: true })
    },
  }
}

export const str = (max = 200) => (v: unknown) => String(v ?? '').slice(0, max)
export const num = (v: unknown) => {
  const n = Number(v)
  if (!isFinite(n)) throw new Error('Número inválido')
  return n
}
export const date = (v: unknown) => {
  if (v == null || v === '') return null
  const s = String(v)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Fecha inválida')
  return s
}
export const month = (v: unknown) => {
  const s = String(v ?? '')
  if (!/^\d{4}-\d{2}$/.test(s)) throw new Error('Mes inválido')
  return s
}
export const oneOf = (...opts: string[]) => (v: unknown) => (opts.includes(String(v)) ? String(v) : opts[0])
