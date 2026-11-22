import assert from 'node:assert/strict'
import { publicationErrorMessage } from '../app/studio/publication-errors'
assert.match(publicationErrorMessage(403, {errors:[{message:'EDITOR_REQUIRED'}]}), /session.*editor/i)
assert.match(publicationErrorMessage(403, {error:'CSRF_ORIGIN_REJECTED'}), /address/i)
assert.match(publicationErrorMessage(400, {errors:[{message:'INVALID_PUBLICATION_DETAILS'}]}), /summary/i)
assert.match(publicationErrorMessage(500, {errors:[{message:'secret-server-detail'}]}), /status/i)
assert.doesNotMatch(publicationErrorMessage(500, {errors:[{message:'secret-server-detail'}]}), /secret/)
assert.match(publicationErrorMessage(403, null), /denied/i)
console.log('publication error messages: passed')
