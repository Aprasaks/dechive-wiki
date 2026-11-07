import { APIError, type Endpoint } from 'payload'
import { packageHash } from '../lib/multi-source-review'
import type { EditorialPackage } from '../lib/editorial-package'

// Read-only, synthetic experiment: this is not a publication approval gate.
export const multiReviewStatus:Endpoint={
 path:'/g1-multi-review-status',method:'get',
 handler:async(req)=>{
  const user=req.user
  if(!user||user.collection!=='staff'||user.role!=='reviewer')throw new APIError('REVIEWER_REQUIRED',403)
  const raw=req.query?.reviewId
  const id=typeof raw==='string'&&/^[1-9][0-9]*$/.test(raw)?Number(raw):NaN
  if(!Number.isSafeInteger(id))throw new APIError('INVALID_REVIEW_ID',400)
  const review=await req.payload.findByID({collection:'multi-source-reviews',id,req,overrideAccess:false})
  if(!review)throw new APIError('REVIEW_NOT_FOUND',404)
  const draft=await req.payload.findByID({collection:'editorial-drafts',id:review.draftId,req,overrideAccess:false,draft:true})
  const extra=draft?.supplementalEvidence as Record<string,unknown>|null
  const editor=typeof draft?.createdBy==='object'?draft.createdBy?.id:draft?.createdBy
  let current=false
  try {
   if(extra&&Array.isArray(extra.sources)&&Array.isArray(extra.claims)&&Array.isArray(extra.media)){
    const p={title:draft.title,body:draft.body,sources:extra.sources,claims:extra.claims,media:extra.media} as EditorialPackage
    current=packageHash(p)===review.snapshotHash&&packageHash(review.snapshot as EditorialPackage)===review.snapshotHash&&
      draft.stableEntityId===review.snapshotEntityId&&String(editor)===review.editorId
   }
  } catch { current=false }
  return Response.json({reviewId:id,status:current?'current':'stale',approved:false,
   notice:'Review status only. Multi-source publication approval is not implemented.'},
   {headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'}})
 },
}
