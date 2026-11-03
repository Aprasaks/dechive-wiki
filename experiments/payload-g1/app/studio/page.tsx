import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import StudioClient from './studio-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata: Metadata = {
  title: 'Editorial Workspace — DECHIVE.WIKI',
  robots: { index: false, follow: false },
}

export default async function StudioPage() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || user.collection !== 'staff' || !['editor','reviewer','publisher'].includes(String(user.role))) {
    redirect('/studio/login')
  }

  const role = user.role as 'editor' | 'reviewer' | 'publisher'
  const email = typeof user.email === 'string' ? user.email : 'Staff member'
  return <StudioClient role={role} email={email} />
}
