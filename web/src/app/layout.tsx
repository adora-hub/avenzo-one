import type { Metadata } from 'next'
import { Inter, Noto_Sans_Thai } from 'next/font/google'
import { cookies } from 'next/headers'
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
  title: 'AVENZAONE',
  description: 'Multi-tenant organization and subscription workspace',
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies()
  const initialTheme = cookieStore.get('avenzaone-theme')?.value === 'dark' ? 'dark' : 'light'

  return (
    <html lang="th" data-theme={initialTheme} suppressHydrationWarning>
      <body className={`${inter.variable} ${notoSansThai.variable}`}>
        <SessionActivityHeartbeat />
        {children}
      </body>
    </html>
  )
}
