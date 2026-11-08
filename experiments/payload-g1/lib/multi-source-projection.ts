import { assessMultiSourceReview, type ReviewInputs } from './multi-source-review'
import type { EditorialPackage } from './editorial-package'

// Private preparation only: this produces no database writes or approval.
export type EvidenceLocation = { claimId:string; sourceId:string; pinpoint:string }
export function prepareMultiSourceProjection(p:EditorialPackage, review:ReviewInputs, locations:EvidenceLocation[]) {
 const assessment=assessMultiSourceReview(p,review)
 if(!assessment.readyForHumanGate) throw new Error('REVIEW_INCOMPLETE_OR_STALE')
 const expected=new Set(p.claims.flatMap(c=>c.sourceIds.map(s=>JSON.stringify([c.id,s]))))
 const byPair=new Map<string,string>()
 for(const entry of locations){
  const key=JSON.stringify([entry.claimId,entry.sourceId])
  if(!expected.has(key)||byPair.has(key)||typeof entry.pinpoint!=='string'||!entry.pinpoint.trim())
   throw new Error('INVALID_EVIDENCE_LOCATION')
  byPair.set(key,entry.pinpoint.trim())
 }
 if(byPair.size!==expected.size) throw new Error('MISSING_EVIDENCE_LOCATION')
 return {status:'private-preparation' as const, snapshotHash:review.snapshotHash,
  title:p.title,body:p.body,
  sources:p.sources.map(s=>({...s})),
  claims:p.claims.map(c=>({id:c.id,anchor:c.anchor,statement:c.statement,
   evidence:c.sourceIds.map(sourceId=>({sourceId,pinpoint:byPair.get(JSON.stringify([c.id,sourceId]))!}))})),
  media:p.media.map(m=>({...m,review:review.media.find(d=>d.mediaId===m.id)!}))}
}
