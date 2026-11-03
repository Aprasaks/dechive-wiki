import { createServer, type Server } from 'node:http'
import { Pool } from 'pg'

// Only accepts PUBLIC_DATABASE_URL for the least-privilege PostgreSQL login.
// This adapter is a test proof, not the final Next.js public route implementation.
export function publicReader(pool: Pool): Server {
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    const json = (status: number, value: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(value))
    }
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1')
      if (request.method !== 'GET') {
        json(405, { error: 'Method not allowed' })
        return
      }

      const match = /^\/v1\/entries\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(url.pathname)
      if (match) {
        const result = await pool.query(
          'SELECT entity_id,locale,version,revision_id,body FROM kg.public_entries WHERE entity_id=$1::uuid AND locale=$2 LIMIT 1',
          [match[1], 'en'],
        )
        if (!result.rows[0]) {
          json(404, { error: 'Not found' })
          return
        }
        json(200, result.rows[0])
        return
      }

      if (url.pathname === '/v1/search') {
        const term = (url.searchParams.get('q') || '').trim()
        if (!term || term.length > 120) {
          json(200, { results: [] })
          return
        }
        const result = await pool.query(
          'SELECT entity_id,locale,version,revision_id,body FROM kg.public_search_verified WHERE position(lower($1::text) in lower(body))>0 ORDER BY version DESC LIMIT 20',
          [term],
        )
        json(200, { results: result.rows })
        return
      }

      if (url.pathname === '/v1/sitemap.xml') {
        const result = await pool.query(
          'SELECT entity_id FROM kg.public_entries ORDER BY entity_id LIMIT 1000',
        )
        const links = result.rows.map(({ entity_id }) => '<url><loc>https://dechive.wiki/knowledge/' + entity_id + '</loc></url>').join('')
        response.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' })
        response.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + links + '</urlset>')
        return
      }

      // No CMS handlers are mounted here: /api, /admin, /drafts, preview
      // routes and Payload GraphQL remain inaccessible by construction.
      json(404, { error: 'Not found' })
    } catch {
      // Never disclose SQL, headers, draft material, or private stack traces.
      json(500, { error: 'Internal server error' })
    }
  })
}
