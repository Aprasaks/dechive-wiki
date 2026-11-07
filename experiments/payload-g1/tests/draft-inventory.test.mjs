import assert from 'node:assert/strict'
import { inventory } from '../scripts/draft-inventory.mjs'

const draft = `# Example
Text [S1, S2] and [S3].
| A | B |
| - | - |
![Alt](image.webp)
## Sources
- **S1.** First source
- **S2.** Second source
`
const result = inventory(draft)
assert.equal(result.headings, 2)
assert.equal(result.tableRows, 2)
assert.equal(result.imageReferences, 1)
assert.equal(result.distinctCitations, 3)
assert.equal(result.declaredSources, 2)
assert.deepEqual(result.unlistedCitationIds, ['S3'])
assert.equal(result.status, 'structural-inventory-only')
assert.notEqual(inventory(draft + ' changed').sha256, result.sha256)
console.log('Draft inventory checks passed')
