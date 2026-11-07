import { createHash } from 'node:crypto'
import { inspectEditorialPackage, type EditorialPackage } from './editorial-package'

// Readiness calculation only: no database write, authentication or approval.
// A real gate must bind separately authenticated decisions to immutable content.
export type EvidenceDecision={claimId:string;sourceId:string;verdict:'verified'|'unverified'|'disputed';note:string}
export type MediaDecision={mediaId:string;verdict:'cleared'|'not-cleared';note:string}
export type ReviewInputs={snapshotHash:string;reviewerId:string;editorId:string;evidence:EvidenceDecision[];media:MediaDecision[]}
function sha(value:string){return createHash('sha256').update(value,'utf8').digest('hex')}
export function packageHash(p:EditorialPackage):string {
 // Fixed keys and order avoid relying on the input object's property order.
 return sha(JSON.stringify({title:p.title,body:p.body,
  sources:p.sources.map(s=>[s.id,s.url,s.description]),
  claims:p.claims.map(c=>[c.id,c.statement,c.anchor,c.sourceIds]),
  media:p.media.map(m=>[m.id,m.objectKey,m.sha256,m.alt,m.credit,m.rightsStatus])}))
}
export function assessMultiSourceReview(p:EditorialPackage,r:ReviewInputs){
 const issues=[...inspectEditorialPackage(p).issues]
 if(!p.claims.length)issues.push('At least one claim must be identified for review')
 if(!r.reviewerId.trim()||!r.editorId.trim()||r.reviewerId===r.editorId)issues.push('An independent reviewer is required')
 if(r.snapshotHash!==packageHash(p))issues.push('Draft changed after the review snapshot')
 const expected=new Set(p.claims.flatMap(c=>c.sourceIds.map(s=>JSON.stringify([c.id,s]))))
 const seen=new Set<string>()
 for(const d of r.evidence){
  const key=JSON.stringify([d.claimId,d.sourceId])
  if(!expected.has(key)||seen.has(key))issues.push('Unknown or duplicate claim-source decision')
  seen.add(key)
  if(d.verdict!=='verified'||!d.note.trim())issues.push('Each claim-source link needs a verified decision and note')
 }
 for(const key of expected)if(!seen.has(key))issues.push('A claim-source decision is missing')
 const assets=new Set(p.media.map(m=>m.id)),seenAssets=new Set<string>()
 for(const d of r.media){
  if(!assets.has(d.mediaId)||seenAssets.has(d.mediaId))issues.push('Unknown or duplicate media decision')
  seenAssets.add(d.mediaId)
  if(d.verdict!=='cleared'||!d.note.trim())issues.push('Each image needs a rights decision and note')
 }
 for(const id of assets)if(!seenAssets.has(id))issues.push('An image rights decision is missing')
 return {issues,readyForHumanGate:issues.length===0,status:'not-approved' as const}
}
