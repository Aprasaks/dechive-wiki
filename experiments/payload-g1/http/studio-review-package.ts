import { APIError, type Endpoint } from 'payload'
import { inspectEditorialPackage, type EditorialPackage } from '../lib/editorial-package'
import { packageHash } from '../lib/multi-source-review'

// Reviewers see the server-loaded draft and its hash; no decision is made here.
export const studioReviewPackage:Endpoint={path:'/studio-review-package',method:'get',handler:async req=>{
 const user=req.user
 if(!user||user.collection!=='staff'||user.role!=='reviewer')throw new APIError('REVIEWER_REQUIRED',403)
 const raw=req.query?.draftId
 const id=typeof raw==='string'&&/^[1-9][0-9]*$/.test(raw)?Number(raw):NaN
 if(!Number.isSafeInteger(id))throw new APIError('INVALID_DRAFT_ID',400)
 const draft=await req.payload.findByID({collection:'editorial-drafts',id,req,overrideAccess:false,draft:true})
 const extra=draft?.supplementalEvidence as Record<string,unknown>|null
 const editor=typeof draft?.createdBy==='object'?draft.createdBy?.id:draft?.createdBy
 if(!draft||!extra||!Array.isArray(extra.sources)||!Array.isArray(extra.claims)||!Array.isArray(extra.media))throw new APIError('PACKAGE_NOT_READY',409)
 if(!editor||String(editor)===String(user.id))throw new APIError('INDEPENDENT_REVIEWER_REQUIRED',403)
 const pack={title:draft.title,body:draft.body,sources:extra.sources,claims:extra.claims,media:extra.media} as EditorialPackage
 try{
  const inspection=inspectEditorialPackage(pack)
  const snapshotHash=packageHash(pack)
  const prior=await req.payload.find({collection:'multi-source-reviews',req,overrideAccess:false,
   where:{and:[{draftId:{equals:id}},{reviewerId:{equals:String(user.id)}},{snapshotHash:{equals:snapshotHash}}]},
   limit:1,sort:'-createdAt'})
  return Response.json({draftId:id,snapshotHash,package:pack,issues:inspection.issues,currentReviewId:prior.docs[0]?.id??null},
   {headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'}})
 }catch{throw new APIError('PACKAGE_INVALID',409)}
}}
