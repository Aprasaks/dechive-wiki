import { APIError, type Endpoint } from 'payload'
import { Pool } from 'pg'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'

// Test-only candidate creation service. This DB role cannot SELECT KG tables,
// INSERT approvals, advance public heads or execute the publish coordinator.
const candidatePool = new Pool({ connectionString: process.env.G1_CANDIDATE_DATABASE_URL })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const declarations = new Set(['unknown','public-domain','cc-by-4.0','permission-required'])
function sha256(value: string) {
  return createHash('sha256').update(value,'utf8').digest('hex')
}

export const candidateEndpoint: Endpoint = {
  path: '/g1-candidate',
  method: 'post',
  handler: async (req) => {
    const person = req.user
    if (!person || person.collection !== 'staff' || person.role !== 'editor') {
      throw new APIError('EDITOR_ROLE_REQUIRED',403)
    }
    const editorId = Number(person.id)
    if (!Number.isSafeInteger(editorId) || editorId < 1) {
      throw new APIError('EDITOR_ID_INVALID',403)
    }
    if (typeof req.json !== 'function') throw new APIError('INVALID_REQUEST',400)
    const data = await req.json().catch(() => { throw new APIError('INVALID_REQUEST',400) })
    const draftId = Number(data?.draftId)
    if (!Number.isSafeInteger(draftId) || draftId < 1) {
      throw new APIError('DRAFT_ID_INVALID',400)
    }
    const doc = await req.payload.findByID({
      collection:'editorial-drafts', id:draftId, req,
      overrideAccess:false, draft:true,
    })
    if (!doc || doc._status === 'published') {
      throw new APIError('DRAFT_NOT_AVAILABLE',404)
    }
    // Never silently publish or attest just one source from a draft that has
    // additional evidence. Multi-source review is not implemented yet.
    if (doc.supplementalEvidence != null) {
      throw new APIError('MULTI_SOURCE_REVIEW_NOT_AVAILABLE',409)
    }
    // The exact author-controlled draft snapshot is loaded from Payload,
    // not accepted as a separate body or entity identifier from the client.
    const title = doc.title
    const body = doc.body
    const entityId = doc.stableEntityId
    if (typeof title !== 'string' || typeof body !== 'string' ||
        typeof entityId !== 'string' || !UUID.test(entityId)) {
      throw new APIError('DRAFT_METADATA_INVALID',400)
    }
    // Editor submits a claim and citation, NOT proof of truth or rights.
    const values = [
      data?.sourceUrl, data?.sourceDescription, data?.claim,
      data?.anchor, data?.pinpoint, data?.licenseDeclaration,
    ]
    if (values.some(v => typeof v !== 'string')) {
      throw new APIError('EVIDENCE_FIELDS_REQUIRED',400)
    }
    const [sourceUrl,sourceDescription,claim,anchor,pinpoint,license] =
      (values as string[]).map(value => value.trim())
    if (!declarations.has(license) || !sourceUrl.startsWith('https://') ||
      sourceUrl.length>512 || sourceDescription.length>700 ||
      claim.length>700 || anchor.length>120 || pinpoint.length>300 ||
      !body.includes(claim)) {
      throw new APIError('EVIDENCE_METADATA_INVALID',400)
    }
    const secret = process.env.G1_CANDIDATE_SECRET ?? ''
    if (!/^[a-f0-9]{64}$/i.test(secret)) {
      throw new APIError('CANDIDATE_SERVICE_UNAVAILABLE',503)
    }
    const revisionId = randomUUID()
    const nonce = randomBytes(16).toString('hex')
    const message = [
      'g1-candidate-v1',String(editorId),String(draftId),entityId,
      revisionId,nonce,...[
        title,body,sourceUrl,sourceDescription,claim,anchor,pinpoint,license
      ].map(sha256),
    ].join('|')
    const signature = createHmac('sha256',Buffer.from(secret,'hex'))
      .update(message,'utf8').digest('hex')
    try {
      await candidatePool.query(
        'SELECT kg.g1_submit_candidate('+
          '$1::bigint,$2::bigint,$3::uuid,$4::uuid,'+
          '$5::text,$6::text,$7::text,$8::text,$9::text,'+
          '$10::text,$11::text,$12::text,$13::text,$14::text'+
        ') AS revision_id',
        [editorId,draftId,entityId,revisionId,title,body,sourceUrl,
          sourceDescription,claim,anchor,pinpoint,license,nonce,signature],
      )
    } catch {
      throw new APIError('CANDIDATE_SUBMISSION_REJECTED',409)
    }
    return Response.json({
      queued:true, status:'needs-review', entityId, revisionId,
      notice:'Editor-submitted evidence is unverified. Rights review and approval are still required.',
    },{status:201})
  },
}
