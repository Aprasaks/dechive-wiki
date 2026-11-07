import assert from 'node:assert/strict'
import { assessMultiSourceReview, packageHash, type ReviewInputs } from '../lib/multi-source-review'
import type { EditorialPackage } from '../lib/editorial-package'
const p:EditorialPackage={title:'Synthetic example',body:'A documented statement.',
 sources:[{id:'s1',url:'https://example.invalid/one',description:'First'},{id:'s2',url:'https://example.invalid/two',description:'Second'}],
 claims:[{id:'c1',statement:'A documented statement.',anchor:'paragraph',sourceIds:['s1','s2']}],
 media:[{id:'m1',objectKey:'review/image.webp',sha256:'a'.repeat(64),alt:'Example',credit:'Creator',rightsStatus:'pending'}]}
const review:ReviewInputs={snapshotHash:packageHash(p),reviewerId:'reviewer',editorId:'editor',
 evidence:[{claimId:'c1',sourceId:'s1',verdict:'verified',note:'Reviewed passage'}, {claimId:'c1',sourceId:'s2',verdict:'verified',note:'Reviewed passage'}],
 media:[{mediaId:'m1',verdict:'cleared',note:'Reviewed permission'}]}
assert.equal(assessMultiSourceReview(p,review).readyForHumanGate,true)
assert.equal(assessMultiSourceReview(p,review).status,'not-approved')
assert.equal(assessMultiSourceReview(p,{...review,evidence:review.evidence.slice(0,1)}).readyForHumanGate,false)
assert.equal(assessMultiSourceReview(p,{...review,media:[]}).readyForHumanGate,false)
assert.equal(assessMultiSourceReview({...p,body:p.body+' changed'},review).readyForHumanGate,false)
assert.equal(assessMultiSourceReview(p,{...review,reviewerId:'editor'}).readyForHumanGate,false)
assert.equal(assessMultiSourceReview(p,{...review,evidence:[...review.evidence,review.evidence[0]]}).readyForHumanGate,false)
assert.equal(assessMultiSourceReview({...p,sources:[{...p.sources[0],description:'changed'},p.sources[1]]},review).readyForHumanGate,false)
console.log('Multi-source review readiness checks passed')
