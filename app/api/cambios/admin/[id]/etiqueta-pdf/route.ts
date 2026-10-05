import { NextResponse } from 'next/server'
import { requireCambiosAdmin } from '@/lib/cambios/adminAuth'
import { supabaseAdmin } from '@/lib/cambios/tiendanube'
import { buildLabelPdf } from '@/lib/cambios/labelPdf'

export const dynamic = 'force-dynamic'

/** PDF 10x15 cm con los datos de entrega, para imprimir. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireCambiosAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const { data: ex } = await supabaseAdmin().from('exchanges').select('*').eq('id', params.id).single()
    if (!ex) return NextResponse.json({ ok: false, error: 'No existe' }, { status: 404 })
    const bytes = await buildLabelPdf(ex)
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="etiqueta-${ex.code}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[cambios/admin/etiqueta-pdf]', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
