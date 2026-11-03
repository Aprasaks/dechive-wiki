import { publicPool } from '../../lib/public-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const result = await publicPool().query(
    'SELECT entity_id FROM kg.public_entries WHERE locale=$1 ORDER BY entity_id LIMIT 1000',
    ['en'],
  )
  const links = result.rows.map(({ entity_id }: { entity_id: string }) =>
    '<url><loc>https://dechive.wiki/knowledge/' + entity_id + '</loc></url>').join('')
  return new Response('<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    links + '</urlset>', {
      headers: { 'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'private, no-store, max-age=0' },
    })
}
