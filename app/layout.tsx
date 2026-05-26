import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/lib/theme-context'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Forever Ads — Panel de Control',
  description: 'Dashboard de Meta Ads para FOREVER BASICS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Previene flash de pantalla blanca al cargar en dark mode */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('forever-theme');if(t==='dark'){document.documentElement.classList.add('dark')}})();` }} />
      </head>
      <body className={`${inter.className} antialiased bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
