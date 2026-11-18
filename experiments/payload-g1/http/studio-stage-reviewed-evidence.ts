import { APIError, type Endpoint } from 'payload'
import { createHmac, createHash, randomBytes, randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { preparePublicationEvidence, type PublicationReview } from '../lib/publication-evidence'
import type { EditorialPackage } from '../lib/editorial-package'
import type { EvidenceDecision, MediaDecision } from '../lib/multi-source-review'

const pool = new Pool({ connectionString: process.env.G1_CANDIDATE_DATABASE_URL })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Authentication and review data come from Payload; the client supplies only an ID.
// Staging is not approval and cannot make evidence public.
export const studioStageReviewedEvidence: Endpoint = {
 path: '/studio-stage-reviewed-evidence', method: 'post', handler: async req => {
  const user = req.user
  if (!user || user.collection !== 'staff' || user.role !== 'reviewer') throw new APIError('REVIEWER_REQUIRED',403)
  const data = await req.json?.().catch(() => null)
  const id = Number(data?.reviewId), reviewer = Number(user.id)
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(reviewer) || reviewer < 1) throw new APIError('INVALID_REVIEW_ID',400)
  const review = await req.payload.findByID({collection:'multi-source-reviews',id,req,overrideAccess:false})
  if (!review || String(reviewer) !== review.reviewerId) throw new APIError('REVIEWER_MISMATCH',403)
  const draft = await req.payload.findByID({collection:'editorial-drafts',id:review.draftId,req,overrideAccess:false,draft:true})
  const extra = draft?.supplementalEvidence as Record<string,unknown> | null
  const editor = typeof draft?.createdBy === 'object' ? draft.createdBy?.id : draft?.createdBy
  if (!draft || !extra || !Array.isArray(extra.sources) || !Array.isArray(extra.claims) || !Array.isArray(extra.media) ||
      typeof draft.stableEntityId !== 'string' || !UUID.test(draft.stableEntityId) ||
      !Array.isArray(review.evidence) || !Array.isArray(review.media)) throw new APIError('REVIEW_STALE_OR_INCOMPLETE',409)
  const pack = {title:draft.title,body:draft.body,sources:extra.sources,claims:extra.claims,media:extra.media} as EditorialPackage
  let prepared: ReturnType<typeof preparePublicationEvidence>
  try {
   const decisions = review.evidence as (EvidenceDecision & {pinpoint:string})[]
   prepared = preparePublicationEvidence({id:String(draft.id),entityId:draft.stableEntityId,editorId:String(editor),title:draft.title,body:draft.body},pack,
    {draftId:String(review.draftId),snapshotEntityId:review.snapshotEntityId,snapshotHash:review.snapshotHash,
     snapshot:review.snapshot as EditorialPackage,editorId:review.editorId,reviewerId:review.reviewerId,
     evidence:decisions,media:review.media as MediaDecision[]} satisfies PublicationReview,
    decisions.map(d=>({claimId:d.claimId,sourceId:d.sourceId,pinpoint:d.pinpoint})))
  } catch { throw new APIError('REVIEW_STALE_OR_INCOMPLETE',409) }
  const secret = process.env.G1_CANDIDATE_SECRET ?? ''
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new APIError('SEAL_SERVICE_UNAVAILABLE',503)
  const revision = randomUUID(), nonce = randomBytes(16).toString('hex')
  const payload = JSON.stringify({entityId:draft.stableEntityId,revisionId:revision,reviewId:id,reviewerId:reviewer,
   editorId:String(editor),snapshotHash:prepared.snapshotHash,title:draft.title,body:draft.body,rows:prepared.rows,reviewSnapshot:review.snapshot,reviewEvidence:review.evidence,reviewMedia:review.media})
  const digest = createHash('sha256').update(payload,'utf8').digest('hex')
  const signature = createHmac('sha256',Buffer.from(secret,'hex')).update(['studio-reviewed-stage-v1',digest,nonce].join('|'),'utf8').digest('hex')
  try { await pool.query('SELECT kg.stage_studio_reviewed_evidence($1::text,$2::text,$3::text)',[payload,nonce,signature]) }
  catch { throw new APIError('EVIDENCE_STAGE_REJECTED',409) }
  return Response.json({staged:true,revisionId:revision,approved:false,published:false},{status:201,headers:{'Cache-Control':'private, no-store'}})
 }
}
