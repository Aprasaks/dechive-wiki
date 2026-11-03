import type { ReactNode } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'DECHIVE.WIKI — Knowledge Archive',
  description: 'A verification-first knowledge archive. Only reviewed knowledge is public.',
  robots: { index: false, follow: false }, // test lab: do not index the preview
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#FAFAF8', color: '#21251F',
        fontFamily: 'Georgia, serif', lineHeight: 1.6 }}>
        <main style={{ maxWidth: 900, padding: '4rem 1.5rem', margin: '0 auto' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
