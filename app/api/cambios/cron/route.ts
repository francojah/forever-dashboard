import { NextResponse } from 'next/server'
import { runExpiry } from '@/lib/cambios/expiry'

export const dynamic = 'force-dynamic'

/** Cron diario de Vercel (Authorization: Bearer CRON_SECRET): recordatorios y vencimiento de cambios sin pago. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await runExpiry({ force: true })) })
  } catch (e) {
    console.error('[cambios/cron]', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
