import { APIError, type Endpoint } from 'payload'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { assessMultiSourceReview, packageHash, type EvidenceDecision, type MediaDecision } from '../lib/multi-source-review'
import type { EditorialPackage } from '../lib/editorial-package'
import { prepareMultiSourceProjection } from '../lib/multi-source-projection'
const pool=new Pool({connectionString:process.env.G1_CANDIDATE_DATABASE_URL})
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const sealMultiReview:Endpoint={path:'/g1-seal-multi-review',method:'post',handler:async(req)=>{
 const user=req.user
 if(!user||user.collection!=='staff'||user.role!=='reviewer')throw new APIError('REVIEWER_REQUIRED',403)
 if(typeof req.json!=='function')throw new APIError('INVALID_REQUEST',400)
 const input=await req.json().catch(()=>{throw new APIError('INVALID_REQUEST',400)})
 const id=Number(input?.reviewId),reviewer=Number(user.id)
 if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(reviewer)||reviewer<1)throw new APIError('INVALID_ID',400)
 const review=await req.payload.findByID({collection:'multi-source-reviews',id,req,overrideAccess:false})
 if(!review||String(reviewer)!==review.reviewerId)throw new APIError('REVIEWER_MISMATCH',403)
 const draft=await req.payload.findByID({collection:'editorial-drafts',id:review.draftId,req,overrideAccess:false,draft:true})
 const extra=draft?.supplementalEvidence as Record<string,unknown>|null
 const editor=typeof draft?.createdBy==='object'?draft.createdBy?.id:draft?.createdBy
 if(!extra||!Array.isArray(extra.sources)||!Array.isArray(extra.claims)||!Array.isArray(extra.media)||
    typeof draft.stableEntityId!=='string'||!UUID.test(draft.stableEntityId)||
    draft.stableEntityId!==review.snapshotEntityId||String(editor)!==review.editorId)throw new APIError('REVIEW_STALE',409)
 const pack={title:draft.title,body:draft.body,sources:extra.sources,claims:extra.claims,media:extra.media} as EditorialPackage
 try {
  if(packageHash(pack)!==review.snapshotHash||packageHash(review.snapshot as EditorialPackage)!==review.snapshotHash)throw new Error('stale')
  if(!Array.isArray(review.evidence)||!Array.isArray(review.media)||
     !assessMultiSourceReview(pack,{snapshotHash:review.snapshotHash,editorId:review.editorId,
       reviewerId:review.reviewerId,evidence:review.evidence as EvidenceDecision[],media:review.media as MediaDecision[]}).readyForHumanGate)
    throw new Error('incomplete')
  prepareMultiSourceProjection(pack,{snapshotHash:review.snapshotHash,editorId:review.editorId,reviewerId:review.reviewerId,evidence:review.evidence as EvidenceDecision[],media:review.media as MediaDecision[]},(review.evidence as (EvidenceDecision & {pinpoint:string})[]).map(d=>({claimId:d.claimId,sourceId:d.sourceId,pinpoint:d.pinpoint})))
 }
 catch { throw new APIError('REVIEW_STALE_OR_INCOMPLETE',409) }
 const secret=process.env.G1_CANDIDATE_SECRET??''
 if(!/^[a-f0-9]{64}$/i.test(secret))throw new APIError('SEAL_SERVICE_UNAVAILABLE',503)
 const revision=randomUUID(),nonce=randomBytes(16).toString('hex')
 const message=['g1-multi-seal-v1',draft.stableEntityId,revision,String(id),String(reviewer),review.snapshotHash,nonce].join('|')
 const signature=createHmac('sha256',Buffer.from(secret,'hex')).update(message,'utf8').digest('hex')
 try { await pool.query('SELECT kg.seal_multi_review($1::uuid,$2::uuid,$3::bigint,$4::bigint,$5::text,$6::text)',[draft.stableEntityId,revision,id,reviewer,nonce,signature]) }
 catch { throw new APIError('SEAL_REJECTED',409) }
 return Response.json({sealed:true,revisionId:revision,approved:false,published:false},{status:201,headers:{'Cache-Control':'private, no-store'}})
}}
