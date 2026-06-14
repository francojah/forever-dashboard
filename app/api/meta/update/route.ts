import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

const META_API = 'https://graph.facebook.com/v21.0'

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const token = process.env.META_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'No META_ACCESS_TOKEN' }, { status: 500 })

  const body = await request.json() as { entityId: string; action: 'pause' | 'activate' | 'set_budget'; value?: number }
  const { entityId, action, value } = body

  if (!entityId || !action) {
    return NextResponse.json({ error: 'entityId y action son requeridos' }, { status: 400 })
  }

  const params = new URLSearchParams({ access_token: token })
  if (action === 'pause')    params.set('status', 'PAUSED')
  if (action === 'activate') params.set('status', 'ACTIVE')
  if (action === 'set_budget' && value != null) {
    params.set('daily_budget', String(Math.round(value * 100))) // ARS → centavos
  }

  const res = await fetch(`${META_API}/${entityId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const data = await res.json() as { error?: { message: string }; success?: boolean }

  if (data.error) {
    return NextResponse.json({ error: data.error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, result: data })
}
