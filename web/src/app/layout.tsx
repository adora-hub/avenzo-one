import type { Metadata } from 'next'
import { Inter, Noto_Sans_Thai } from 'next/font/google'
import { SessionActivityHeartbeat } from '@/app/components/session-activity-heartbeat'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  variable: '--font-noto-sans-thai',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AVENZO ONE',
  description: 'Multi-tenant organization and subscription workspace',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className={`${inter.variable} ${notoSansThai.variable}`}>
        <SessionActivityHeartbeat />
        {children}
      </body>
    </html>
  )
}
