import { APIError, type Endpoint } from 'payload'
import { createHmac, randomBytes } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { Pool } from 'pg'
import { preparePublicationEvidence, type PublicationReview } from '../lib/publication-evidence'
import type { EditorialPackage } from '../lib/editorial-package'
import type { EvidenceDecision, MediaDecision } from '../lib/multi-source-review'

const pool = new Pool({connectionString:process.env.G1_REVIEWER_DATABASE_URL})
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const studioApproveReviewedEvidence:Endpoint={path:'/studio-approve-reviewed-evidence',method:'post',handler:async req=>{
 const user=req.user
 if(!user||user.collection!=='staff'||user.role!=='reviewer')throw new APIError('REVIEWER_REQUIRED',403)
 const input=await req.json?.().catch(()=>null)
 const revision=input?.revisionId, reviewer=Number(user.id), reviewId=Number(input?.reviewId)
 if(typeof revision!=='string'||!UUID.test(revision)||!Number.isSafeInteger(reviewer)||reviewer<1||!Number.isSafeInteger(reviewId)||reviewId<1)throw new APIError('INVALID_REQUEST',400)
 const review=await req.payload.findByID({collection:'multi-source-reviews',id:reviewId,req,overrideAccess:false})
 if(!review||String(reviewer)!==review.reviewerId)throw new APIError('REVIEWER_MISMATCH',403)
 const draft=await req.payload.findByID({collection:'editorial-drafts',id:review.draftId,req,overrideAccess:false,draft:true})
 const extra=draft?.supplementalEvidence as Record<string,unknown>|null
 const editor=typeof draft?.createdBy==='object'?draft.createdBy?.id:draft?.createdBy
 if(!draft||!extra||!Array.isArray(extra.sources)||!Array.isArray(extra.claims)||!Array.isArray(extra.media)||
  typeof draft.stableEntityId!=='string'||!UUID.test(draft.stableEntityId)||!Array.isArray(review.evidence)||!Array.isArray(review.media))throw new APIError('REVIEW_STALE_OR_INCOMPLETE',409)
 const pack={title:draft.title,body:draft.body,sources:extra.sources,claims:extra.claims,media:extra.media} as EditorialPackage
 let prepared:ReturnType<typeof preparePublicationEvidence>
 try{
  const decisions=review.evidence as (EvidenceDecision & {pinpoint:string})[]
  prepared=preparePublicationEvidence({id:String(draft.id),entityId:draft.stableEntityId,editorId:String(editor),title:draft.title,body:draft.body},pack,
   {draftId:String(review.draftId),snapshotEntityId:review.snapshotEntityId,snapshotHash:review.snapshotHash,snapshot:review.snapshot as EditorialPackage,
    editorId:review.editorId,reviewerId:review.reviewerId,evidence:decisions,media:review.media as MediaDecision[]} satisfies PublicationReview,
   decisions.map(d=>({claimId:d.claimId,sourceId:d.sourceId,pinpoint:d.pinpoint})))
 }catch{throw new APIError('REVIEW_STALE_OR_INCOMPLETE',409)}
 const result=await pool.query('SELECT * FROM kg.studio_reviewed_approval_context($1::uuid,$2::bigint)',[revision,reviewer])
 const row=result.rows[0],p=row?.payload
 if(!p||p.entityId!==draft.stableEntityId||p.revisionId!==revision||p.reviewId!==reviewId||p.reviewerId!==reviewer||
  p.editorId!==String(editor)||p.title!==draft.title||p.body!==draft.body||p.snapshotHash!==prepared.snapshotHash||
  !isDeepStrictEqual(p.rows,prepared.rows)||!isDeepStrictEqual(p.reviewSnapshot,review.snapshot)||
  !isDeepStrictEqual(p.reviewEvidence,review.evidence)||!isDeepStrictEqual(p.reviewMedia,review.media)||
  typeof row.payload_digest!=='string'||!/^[a-f0-9]{64}$/.test(row.payload_digest))throw new APIError('STAGED_REVIEW_MISMATCH',409)
 const secret=process.env.G1_REVIEW_ATTESTATION_SECRET??''
 if(!/^[a-f0-9]{64}$/i.test(secret))throw new APIError('APPROVAL_SERVICE_UNAVAILABLE',503)
 const nonce=randomBytes(16).toString('hex')
 const signature=createHmac('sha256',Buffer.from(secret,'hex')).update(['studio-reviewed-approval-v1',revision,String(reviewer),row.payload_digest,nonce].join('|'),'utf8').digest('hex')
 try{await pool.query('SELECT kg.approve_studio_reviewed_evidence($1::uuid,$2::bigint,$3::text,$4::text)',[revision,reviewer,nonce,signature])}
 catch{throw new APIError('REVIEW_APPROVAL_REJECTED',409)}
 return Response.json({approved:true,revisionId:revision},{headers:{'Cache-Control':'private, no-store'}})
}}
