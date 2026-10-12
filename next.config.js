const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['graph.facebook.com', 'acdn-us.mitiendanube.com', 'scontent.xx.fbcdn.net'],
  },
  // Secciones viejas → las 5 nuevas
  async redirects() {
    const to = (dest) => (src) => ({ source: src, destination: dest, permanent: false })
    return [
      ...['/tiendanube', '/negocio', '/analytics'].map(to('/ventas')),
      ...['/campanias', '/creativos', '/presupuesto'].map(to('/anuncios')),
      to('/finanzas')('/balance'),
      to('/ajustes')('/settings'),
      ...['/competencia', '/resumen', '/assistant', '/chat', '/ideas', '/leads', '/eventos', '/historico', '/alertas', '/recomendaciones', '/onboarding'].map(to('/')),
    ]
  },
  // Cabeceras de seguridad para toda la app
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ],
    }]
  },
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname)
    return config
  },
}

module.exports = nextConfig
