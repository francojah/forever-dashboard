import type { Metadata, Viewport } from 'next'
import { Inter, Onest } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/lib/theme-context'

const inter = Inter({ subsets: ['latin'] })
const onest = Onest({ subsets: ['latin'], variable: '--font-faro', display: 'swap' })

export const metadata: Metadata = {
  title: 'Faro',
  description: 'Ventas, anuncios y ganancia de tu ecommerce en un solo lugar',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Faro',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Previene flash de pantalla blanca al cargar en dark mode */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){if(location.hostname.indexOf('cambios.')===0||location.pathname.indexOf('/cambios')===0)return;var t=localStorage.getItem('forever-theme');if(!t||t==='dark'){document.documentElement.classList.add('dark')}})();` }} />
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${inter.className} ${onest.variable} antialiased bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
