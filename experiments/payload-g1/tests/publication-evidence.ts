import assert from 'node:assert/strict'
import { packageHash } from '../lib/multi-source-review'
import { preparePublicationEvidence } from '../lib/publication-evidence'
import type { EditorialPackage } from '../lib/editorial-package'
const pack: EditorialPackage = {
 title: 'Volcano', body: 'Ash is volcanic material.',
 sources: [{id:'s1',url:'https://example.org/source',description:'Source'}],
 claims: [{id:'c1',statement:'Ash is volcanic material.',anchor:'paragraph-1',sourceIds:['s1']}], media: [],
}
const review = {snapshotHash:packageHash(pack), editorId:'editor', reviewerId:'reviewer',
 evidence:[{claimId:'c1',sourceId:'s1',verdict:'verified' as const,note:'Checked'}], media:[]}
const location = [{claimId:'c1',sourceId:'s1',pinpoint:'Section 1'}]
const prepared = preparePublicationEvidence({title:pack.title,body:pack.body},pack,review,location)
assert.equal(prepared.status,'private-preparation')
assert.equal(prepared.rows.length,1)
assert.equal(prepared.rows[0].pinpoint,'Section 1')
assert.throws(()=>preparePublicationEvidence({title:pack.title,body:pack.body+' Changed'},pack,review,location),/PUBLICATION_REVIEW_MISMATCH/)
assert.throws(()=>preparePublicationEvidence({title:pack.title,body:pack.body},pack,{...review,reviewerId:'editor'},location),/REVIEW_INCOMPLETE_OR_STALE/)
assert.throws(()=>preparePublicationEvidence({title:pack.title,body:pack.body},pack,{...review,evidence:[{...review.evidence[0],verdict:'unverified'}]},location),/REVIEW_INCOMPLETE_OR_STALE/)
assert.throws(()=>preparePublicationEvidence({title:pack.title,body:pack.body},pack,review,[]),/MISSING_EVIDENCE_LOCATION/)
assert.throws(()=>preparePublicationEvidence({title:pack.title,body:pack.body},pack,review,[...location,...location]),/INVALID_EVIDENCE_LOCATION/)
console.log('publication evidence validation passed')
