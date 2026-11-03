import { notFound } from 'next/navigation'
import { publicPool } from '../../../lib/public-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function KnowledgePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const records = await publicPool().query(
    'SELECT entity_id, locale, version, revision_id, body FROM kg.public_entries WHERE entity_id = $1::uuid AND locale = $2 LIMIT 1',
    [id, 'en'],
  )
  const record = records.rows[0]
  if (!record) notFound()
  return (
    <article>
      <p style={{ fontFamily:'Arial, sans-serif', fontSize:12, letterSpacing:3 }}>DECHIVE.WIKI / VERIFIED KNOWLEDGE</p>
      <h1 style={{ fontSize:36, fontWeight:400 }}>Knowledge Record</h1>
      <p data-testid="public-approved-body">{record.body}</p>
      <footer style={{ borderTop:'1px solid #ccc', marginTop:48, paddingTop:16 }}>
        <small>Verified revision {record.version}. English language archive.</small>
      </footer>
    </article>
  )
}
