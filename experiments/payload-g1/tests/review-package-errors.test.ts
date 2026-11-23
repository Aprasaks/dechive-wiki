import assert from 'node:assert/strict'
import { reviewPackageErrorMessage } from '../app/studio/review-package-errors.ts'
assert.match(reviewPackageErrorMessage(403, {errors:[{message:'REVIEWER_REQUIRED'}]}), /session or reviewer role/)
assert.match(reviewPackageErrorMessage(403, {errors:[{message:'REVIEWER_NOT_ALLOWED'}]}), /draft owner/)
assert.match(reviewPackageErrorMessage(403, {error:'CSRF_ORIGIN_REJECTED'}), /connection or address/)
assert.match(reviewPackageErrorMessage(409, {errors:[{message:'PACKAGE_NOT_READY'}]}), /source package/)
assert.match(reviewPackageErrorMessage(409, {errors:[{message:'PACKAGE_INVALID'}]}), /server logs/)
assert.match(reviewPackageErrorMessage(403, null), /denied/)
assert.doesNotMatch(reviewPackageErrorMessage(500, {errors:[{message:'secret server detail'}]}), /secret server detail/)
console.log('Review package error messages passed')
