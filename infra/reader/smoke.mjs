// Run against the standalone server, with synthetic CI data only.
import assert from 'node:assert/strict'
const origin = 'http://127.0.0.1:3120'
let ready = false
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(origin)).ok) { ready = true; break } } catch {}
  await new Promise(resolve => setTimeout(resolve, 1000))
}
assert(ready, 'standalone server starts with only read-only credentials')
const home = await fetch(origin)
assert.equal(home.status, 200)
assert((await home.text()).includes('DECHIVE.WIKI'))
const search = await fetch(origin + '/search?q=SYNTHETIC')
assert.equal(search.status, 200)
const html = await search.text()
const link = html.match(/href="(\/knowledge\/[0-9a-f-]{36})"/)
assert(link, 'search returns an approved synthetic entry')
const detail = await fetch(origin + link[1])
assert.equal(detail.status, 200)
assert((await detail.text()).includes('Claims &amp; sources'))
for (const path of ['/studio', '/api/staff', '/api/graphql', '/api/g1/publish', '/payload.config.ts']) {
  assert.equal((await fetch(origin + path)).status, 404, path)
}
assert.equal((await fetch(origin + '/api/staff/login', {
  method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}',
})).status, 404)
assert.equal((await fetch(origin + '/knowledge/00000000-0000-0000-0000-000000000000')).status, 404)
assert.match(search.headers.get('x-robots-tag'), /noindex/)
assert.match(search.headers.get('cache-control'), /no-store/)
assert.equal(search.headers.get('x-frame-options'), 'DENY')
assert.equal(search.headers.get('x-powered-by'), null)
console.log('READER_STANDALONE_18_CHECKS_SUCCESS')
