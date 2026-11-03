import { APIError, type Endpoint } from 'payload'
import { Pool } from 'pg'
import { createHmac, randomBytes } from 'node:crypto'

// G1 disposable integration proof. Each handler verifies the signed Payload
// session first, then uses one distinct, least-privileged database login.
// NEVER place these service connection URLs in browser code.
const reviewerPool = new Pool({ connectionString: process.env.G1_REVIEWER_DATABASE_URL })
const publisherPool = new Pool({ connectionString: process.env.G1_PUBLISHER_DATABASE_URL })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requireRole(req: { user?: unknown }, role: 'reviewer' | 'publisher') {
  const u = req.user
  if (!u || typeof u !== 'object' || !('collection' in u) ||
      u.collection !== 'staff' || !('role' in u) || u.role !== role) {
    throw new APIError('EDITORIAL_ROLE_REQUIRED', 403)
  }
}

function safeUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new APIError('INVALID_REVISION_IDENTIFIER', 400)
  }
  return value
}

const approval: Endpoint = {
  path: '/g1-approve',
  method: 'post',
  handler: async (req) => {
    requireRole(req, 'reviewer')
    if (typeof req.json !== 'function') throw new APIError('INVALID_REQUEST_BODY', 400)
    const data = await req.json().catch(() => { throw new APIError('INVALID_REQUEST_BODY', 400) })
    const revisionId = safeUuid(data?.revisionId)
    const draftId = data?.draftId
    if ((!Number.isSafeInteger(draftId) && typeof draftId !== 'string') || draftId == null) {
      throw new APIError('INVALID_DRAFT_IDENTIFIER', 400)
    }

    const doc = await req.payload.findByID({
      collection: 'editorial-drafts', id: draftId,
      req, overrideAccess: false, draft: true,
    })
    if (!doc) throw new APIError('DRAFT_NOT_FOUND', 404)
    const revision = await reviewerPool.query(
      'SELECT id,entity_id,body,checksum FROM kg.revisions WHERE id=$1::uuid',
      [revisionId],
    )
    const row = revision.rows[0]
    if (!row ||
      row.entity_id !== doc.stableEntityId ||
      row.body !== doc.body) {
      throw new APIError('REVIEWED_SNAPSHOT_DOES_NOT_MATCH_DRAFT', 409)
    }

    // Never accept a reviewer ID, checksum or signature from the HTTP caller.
    // The JWT identity has been checked by Payload, and the DB separately
    // verifies staff role, checksum and a server-only HMAC binding.
    const actorId = Number(req.user?.id)
    if (!Number.isSafeInteger(actorId) || actorId < 1) {
      throw new APIError('INVALID_REVIEWER_SESSION', 403)
    }
    const signingSecret = process.env.G1_REVIEW_ATTESTATION_SECRET ?? ''
    if (!/^[0-9a-f]{64}$/i.test(signingSecret)) {
      throw new APIError('REVIEW_ATTESTATION_UNAVAILABLE', 503)
    }
    const nonce = randomBytes(16).toString('hex')
    const message = [revisionId, String(actorId), row.checksum, nonce].join('|')
    const signature = createHmac('sha256', Buffer.from(signingSecret, 'hex'))
      .update(message, 'utf8').digest('hex')

    try {
      await reviewerPool.query(
        'SELECT kg.approve_revision_attested($1::uuid,$2::bigint,$3::text,$4::text)',
        [revisionId, actorId, nonce, signature],
      )
    } catch {
      // Never reflect raw SQL/evidence or HMAC material into HTTP responses.
      throw new APIError('REVISION_NOT_APPROVABLE', 409)
    }
    return Response.json({ approved: true, revisionId }, { status: 200 })
  },
}

const publication: Endpoint = {
  path: '/g1-publish',
  method: 'post',
  handler: async (req) => {
    requireRole(req, 'publisher')
    if (typeof req.json !== 'function') throw new APIError('INVALID_REQUEST_BODY', 400)
    const data = await req.json().catch(() => { throw new APIError('INVALID_REQUEST_BODY', 400) })
    const entityId = safeUuid(data?.entityId)
    const revisionId = safeUuid(data?.revisionId)
    const expectedVersion = data?.expectedVersion
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      throw new APIError('INVALID_EXPECTED_VERSION', 400)
    }
    try {
      const result = await publisherPool.query(
        'SELECT kg.publish($1::uuid,$2::uuid,$3::bigint) AS version',
        [entityId, revisionId, expectedVersion],
      )
      return Response.json({
        published: true, entityId, revisionId,
        version: Number(result.rows[0].version),
      }, { status: 200 })
    } catch {
      throw new APIError('PUBLICATION_DENIED_BY_KNOWLEDGE_CORE', 409)
    }
  },
}

export const g1WorkflowEndpoints: Endpoint[] = [approval, publication]
