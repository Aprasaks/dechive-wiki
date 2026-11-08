import assert from 'node:assert/strict'
import { prepareMultiSourceProjection } from '../lib/multi-source-projection'
import { packageHash, type ReviewInputs } from '../lib/multi-source-review'
import type { EditorialPackage } from '../lib/editorial-package'
const p:EditorialPackage={title:'Synthetic example',body:'A documented statement.',sources:[
 {id:'s1',url:'https://example.invalid/one',description:'First'},
 {id:'s2',url:'https://example.invalid/two',description:'Second'}],
 claims:[{id:'c1',statement:'A documented statement.',anchor:'intro',sourceIds:['s1','s2']}],
 media:[{id:'m1',objectKey:'review/image.webp',sha256:'a'.repeat(64),alt:'Example',credit:'Creator',rightsStatus:'pending'}]}
const review:ReviewInputs={snapshotHash:packageHash(p),reviewerId:'reviewer',editorId:'editor',
 evidence:[{claimId:'c1',sourceId:'s1',verdict:'verified',note:'Checked'}, {claimId:'c1',sourceId:'s2',verdict:'verified',note:'Checked'}],
 media:[{mediaId:'m1',verdict:'cleared',note:'Rights checked'}]}
const locations=[{claimId:'c1',sourceId:'s1',pinpoint:'p. 2'},{claimId:'c1',sourceId:'s2',pinpoint:'section 3'}]
const result=prepareMultiSourceProjection(p,review,locations)
assert.equal(result.status,'private-preparation')
assert.equal(result.claims[0].evidence.length,2)
assert.equal(result.claims[0].evidence[1].pinpoint,'section 3')
assert.equal(result.media[0].review.verdict,'cleared')
assert.throws(()=>prepareMultiSourceProjection(p,review,locations.slice(0,1)),/MISSING_EVIDENCE_LOCATION/)
assert.throws(()=>prepareMultiSourceProjection(p,review,[...locations,locations[0]]),/INVALID_EVIDENCE_LOCATION/)
assert.throws(()=>prepareMultiSourceProjection(p,review,[locations[0],{...locations[1],pinpoint:' '}]),/INVALID_EVIDENCE_LOCATION/)
assert.throws(()=>prepareMultiSourceProjection(p,{...review,media:[]},locations),/REVIEW_INCOMPLETE_OR_STALE/)
assert.throws(()=>prepareMultiSourceProjection({...p,body:p.body+' changed'},review,locations),/REVIEW_INCOMPLETE_OR_STALE/)
console.log('Multi-source projection preserves evidence locations and media review')
