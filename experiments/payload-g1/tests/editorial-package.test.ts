import assert from 'node:assert/strict'
import { inspectEditorialPackage, type EditorialPackage } from '../lib/editorial-package'
const original='A long article. '.repeat(1200)+'A documented statement.'
const draft:EditorialPackage={title:'A synthetic example',body:original,
 sources:[{id:'s1',url:'https://example.org/one',description:'First source'},{id:'s2',url:'https://example.org/two',description:'Second source'}],
 claims:[{id:'c1',statement:'A documented statement.',anchor:'introduction',sourceIds:['s1','s2']}],
 media:[{id:'m1',objectKey:'review/image.webp',sha256:'a'.repeat(64),alt:'An image',credit:'Example author',rightsStatus:'pending'}]}
const result=inspectEditorialPackage(draft)
assert.deepEqual(result.issues,[])
assert.equal(result.status,'private-unreviewed')
assert.equal(result.sourceCount,2)
assert.equal(draft.body,original)
assert.notEqual(result.bodySha256,inspectEditorialPackage({...draft,body:original+'x'}).bodySha256)
const bad=inspectEditorialPackage({...draft,claims:[{...draft.claims[0],sourceIds:['s1','missing'],statement:'Fabricated'}],media:[{...draft.media[0],objectKey:'review/../secret'}]})
assert.equal(bad.issues.length,3)
assert.ok(inspectEditorialPackage({...draft,sources:[...draft.sources,draft.sources[0]]}).issues.length)
assert.ok(inspectEditorialPackage({...draft,sources:[{...draft.sources[0],url:'https://name:password@example.org'}]}).issues.length)
console.log('Private editorial package checks passed')
