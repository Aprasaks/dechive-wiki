import assert from 'node:assert/strict'
import { packageHash } from '../lib/multi-source-review'
import { preparePublicationEvidence } from '../lib/publication-evidence'
import type { EditorialPackage } from '../lib/editorial-package'

const pack: EditorialPackage = {
 title:'Volcano', body:'Ash is volcanic material.',
 sources:[{id:'s1',url:'https://example.org/source',description:'Source'}],
 claims:[{id:'c1',statement:'Ash is volcanic material.',anchor:'paragraph-1',sourceIds:['s1']}], media:[],
}
const draft={id:'4',entityId:'entity-1',editorId:'editor',title:pack.title,body:pack.body}
const review={draftId:draft.id,snapshotEntityId:draft.entityId,snapshotHash:packageHash(pack),
 snapshot:structuredClone(pack),editorId:'editor',reviewerId:'reviewer',
 evidence:[{claimId:'c1',sourceId:'s1',verdict:'verified' as const,note:'Checked'}],media:[]}
const locations=[{claimId:'c1',sourceId:'s1',pinpoint:'Section 1'}]
const result=preparePublicationEvidence(draft,pack,review,locations)
assert.equal(result.status,'private-preparation')
assert.equal(result.reviewMode,'independent')
const operatorReview={...review,reviewerId:'editor',reviewMode:'operator' as const}
assert.equal(preparePublicationEvidence(draft,pack,operatorReview,locations).reviewMode,'operator')
assert.throws(()=>preparePublicationEvidence(draft,pack,{...operatorReview,evidence:[]},locations),/REVIEW_INCOMPLETE_OR_STALE/)
assert.throws(()=>preparePublicationEvidence({...draft,body:draft.body+' changed'},pack,operatorReview,locations),/PUBLICATION_REVIEW_MISMATCH/)
assert.equal(result.rows[0].pinpoint,'Section 1')
assert.throws(()=>preparePublicationEvidence({...draft,body:draft.body+' changed'},pack,review,locations),/PUBLICATION_REVIEW_MISMATCH/)
assert.throws(()=>preparePublicationEvidence({...draft,id:'5'},pack,review,locations),/PUBLICATION_REVIEW_MISMATCH/)
assert.throws(()=>preparePublicationEvidence({...draft,entityId:'other'},pack,review,locations),/PUBLICATION_REVIEW_MISMATCH/)
assert.throws(()=>preparePublicationEvidence({...draft,editorId:'other'},pack,review,locations),/PUBLICATION_REVIEW_MISMATCH/)
assert.throws(()=>preparePublicationEvidence(draft,pack,{...review,snapshot:{...pack,body:'changed'}},locations),/PUBLICATION_REVIEW_MISMATCH/)
assert.throws(()=>preparePublicationEvidence(draft,{...pack,sources:[{...pack.sources[0],url:'https://example.org/changed'}]},review,locations),/PUBLICATION_REVIEW_MISMATCH/)
assert.throws(()=>preparePublicationEvidence(draft,pack,{...review,reviewerId:'editor'},locations),/REVIEW_INCOMPLETE_OR_STALE/)
assert.throws(()=>preparePublicationEvidence(draft,pack,{...review,evidence:[{...review.evidence[0],verdict:'unverified'}]},locations),/REVIEW_INCOMPLETE_OR_STALE/)
assert.throws(()=>preparePublicationEvidence(draft,pack,review,[]),/MISSING_EVIDENCE_LOCATION/)
assert.throws(()=>preparePublicationEvidence(draft,pack,review,[...locations,...locations]),/INVALID_EVIDENCE_LOCATION/)
console.log('publication evidence validation passed')
