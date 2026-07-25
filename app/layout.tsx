import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { sans, mono } from './fonts'

export const metadata: Metadata = {
  title: 'ARGUS — Intelligence watch',
  description: 'Watch a region, collect events, save research, and read AI briefs. Desktop workspace + mobile brief history.',
  authors: [
    { name: 'Zachary Adam', url: 'https://github.com/zachary-adam' },
    { name: 'Maaz Ahmad' },
  ],
  publisher: 'Shama Research',
  creator: 'Zachary Adam & Maaz Ahmad',
  keywords: ['political risk', 'election monitoring', 'conflict analysis', 'OSINT', 'civil unrest', 'intelligence'],
  openGraph: {
    title: 'ARGUS — Intelligence watch',
    description: 'Map-first desktop workspace. Mobile: project list and AI brief history.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className={sans.className}>
        <Providers>
          <div className="argus-app-root">{children}</div>
        </Providers>
      </body>
    </html>
  )
}
