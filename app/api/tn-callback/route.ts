import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const APP_ID     = process.env.TIENDANUBE_APP_ID || '30221'
const APP_SECRET = process.env.TIENDANUBE_CLIENT_SECRET!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code    = searchParams.get('code')
  const storeId = searchParams.get('store_id') // some versions send this

  if (!code) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;padding:40px">
        <h2>❌ No se recibió el código de autorización</h2>
        <p>Volvé a intentar el proceso de instalación.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch(`https://www.tiendanube.com/apps/authorize/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     APP_ID,
        client_secret: APP_SECRET,
        grant_type:    'authorization_code',
        code,
      }),
    })

    const tokenData = await tokenRes.json()

    if (!tokenData.access_token) {
      throw new Error(JSON.stringify(tokenData))
    }

    const { access_token, user_id } = tokenData

    // Save to Supabase for reference (best-effort, ignore if table doesn't exist)
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
        await supabase.from('app_config').upsert({
          key: 'tiendanube_credentials',
          value: { access_token, user_id, connected_at: new Date().toISOString() },
        }, { onConflict: 'key' })
      } catch { /* ignore if table doesn't exist */ }
    }

    // Show success page with the credentials
    return new NextResponse(`
      <html>
      <head><title>Tiendanube conectado</title></head>
      <body style="font-family:-apple-system,sans-serif;padding:40px;max-width:600px;margin:0 auto">
        <h2 style="color:#16a34a">✅ Tiendanube conectado exitosamente</h2>
        <p>Copiá estas variables y agregalas en Vercel y GitHub Secrets:</p>
        
        <div style="background:#f4f4f5;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:0 0 8px"><strong>TIENDANUBE_USER_ID</strong></p>
          <code style="font-size:16px;background:#e4e4e7;padding:8px 12px;border-radius:4px;display:block">${user_id}</code>
        </div>
        
        <div style="background:#f4f4f5;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:0 0 8px"><strong>TIENDANUBE_ACCESS_TOKEN</strong></p>
          <code style="font-size:16px;background:#e4e4e7;padding:8px 12px;border-radius:4px;display:block">${access_token}</code>
        </div>

        <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0;font-size:14px;color:#92400e">
            ⚠️ <strong>Guardá estos valores ahora.</strong> El access token no vuelve a mostrarse.
          </p>
        </div>

        <p style="font-size:14px;color:#6b7280">
          Donde agregarlos:<br>
          1. <strong>Vercel</strong>: Dashboard → Settings → Environment Variables<br>
          2. <strong>GitHub Secrets</strong>: Repo → Settings → Secrets and variables → Actions<br>
          3. <strong>.env.local</strong>: en tu proyecto local
        </p>

        <a href="/" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#18181b;color:white;border-radius:8px;text-decoration:none">
          Volver al dashboard
        </a>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new NextResponse(`
      <html><body style="font-family:sans-serif;padding:40px">
        <h2>❌ Error al obtener el token</h2>
        <pre style="background:#fee2e2;padding:16px;border-radius:8px">${msg}</pre>
        <p>Revisá que el Client Secret esté bien configurado en las variables de entorno de Vercel.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }
}
