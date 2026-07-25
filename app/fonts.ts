import { IBM_Plex_Mono, Inter } from 'next/font/google'

/** Primary UI — smooth neutral sans (consumer surfaces) */
export const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

/** Data — timestamps, IDs, tabular fields */
export const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
})
