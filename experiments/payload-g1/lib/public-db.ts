import 'server-only'
import { Pool } from 'pg'

// This pool MUST be backed by the standalone, read-only PostgreSQL role.
// No editor, reviewer, publisher, or schema-owner credentials are accepted.
let pool: Pool | undefined
export function publicPool(): Pool {
  const url = process.env.PUBLIC_DATABASE_URL ?? ''
  if (!url || !url.includes('kg_public_http:')) {
    throw new Error('The public web runtime requires an isolated read-only KG role')
  }
  pool ??= new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 4000 })
  return pool
}
