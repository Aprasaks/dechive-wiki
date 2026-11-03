import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { getPayload } from 'payload'
import config from '../payload.config.ts'
import { publicReader } from '../http/public-reader.ts'

const ADMIN_URL = process.env.DATABASE_URL
const PUBLIC_URL = process.env.PUBLIC_DATABASE_URL
if (!ADMIN_URL || !PUBLIC_URL || ADMIN_URL === PUBLIC_URL) {
  throw new Error('G1 requires two distinct PostgreSQL credentials')
}
const admin = new Pool({ connectionString: ADMIN_URL, connectionTimeoutMillis: 4000 })
const reader = new Pool({ connectionString: PUBLIC_URL, connectionTimeoutMillis: 4000 })
const WATCHDOG = setTimeout(() => {
  console.error('G1_HTTP_WATCHDOG_EXPIRED')
  process.exit(124)
}, 120000)

const entity = randomUUID()
const source = randomUUID()
const revision = randomUUID()
const approvedText = 'Synthetic approved statement: paper introduced a test idea.'
const draftText = 'PRIVATE DRAFT: the unreviewed secret test sentence'
const payload = await getPayload({ config })
let checks = 0

async function verify(name: string, cb: () => Promise<void>) {
  await cb()
  checks++
  console.log('PASS / '+name)
}

const server = publicReader(reader)
await new Promise<void>((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const address = server.address()
if (!address || typeof address === 'string') throw new Error('No loopback HTTP port')
const base = 'http://127.0.0.1:' + address.port

async function get(path: string, init?: RequestInit) {
  return fetch(base + path, { redirect: 'manual', ...init })
}
async function asJson(path: string) {
  const result = await get(path)
  return { status: result.status, content: await result.json(), headers: result.headers }
}
async function prepareRevision() {
  await admin.query('INSERT INTO kg.entities(id,kind,name) VALUES($1,$2,$3)', [entity,'concept','G1 HTTP synthetic topic'])
  await admin.query('INSERT INTO kg.sources(id,locator,description) VALUES($1,$2,$3)',[
    source,'urn:synthetic:g1-http:'+source,'test-only source, not a real citation'
  ])
  await admin.query('INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES($1,$2,$3,$4)',[
    revision,entity,'en',approvedText
  ])
  await admin.query('INSERT INTO kg.claims(revision_id,claim_key,anchor,statement) VALUES($1,$2,$3,$4)',[
    revision,'c1','paragraph-1','paper introduced a test idea'
  ])
  await admin.query('INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) VALUES($1,$2,$3,$4,$5,$6)',[
    revision,'c1',source,'supports','test-fixture','synthetic-reviewer'
  ])
}
async function forbiddenSql(statement: string, params: unknown[] = []) {
  await assert.rejects(reader.query(statement, params), /permission denied|not authorized|insufficient privilege/i)
}
try {
  const draft = await payload.create({
    collection:'editorial-drafts',draft:true,
    data:{stableEntityId:entity,title:'G1 HTTP Draft',body:draftText}
  })
  await prepareRevision()
  await verify('Reader HTTP process actually authenticates as restricted DB user', async () => {
    const who = (await reader.query('select current_user as name')).rows[0].name
    assert.equal(who,'kg_public_http')
  })
  await verify('Restricted DB role cannot select unpublished revisions',async()=>{
    await forbiddenSql('SELECT id,body FROM kg.revisions LIMIT 1')
    await forbiddenSql('SELECT * FROM kg.claim_evidence LIMIT 1')
  })
  await verify('Restricted DB role cannot create approval, even if it knows UUIDs',async()=>{
    await forbiddenSql('INSERT INTO kg.approvals(revision_id,reviewer) VALUES($1,$2)',[revision,'attacker'])
  })
  await verify('Restricted DB role cannot invoke privileged publication or outbox mutation',async()=>{
    await forbiddenSql('SELECT kg.publish($1,$2,$3)',[entity,revision,0])
    await forbiddenSql('SELECT kg.project_event($1)',[1])
  })
  await verify('Pre-approval HTTP knowledge URL is 404',async()=>{
    assert.equal((await get('/v1/entries/'+entity)).status,404)
  })
  await verify('Pre-approval HTTP search has no draft and no unapproved knowledge',async()=>{
    for (const q of [draftText,'test idea']) {
      const result=await asJson('/v1/search?q='+encodeURIComponent(q))
      assert.equal(result.status,200)
      assert.deepEqual(result.content.results,[])
    }
  })
  await verify('Unapproved draft is absent from public XML sitemap',async()=>{
    const result=await get('/v1/sitemap.xml')
    assert.equal(result.status,200)
    const text=await result.text()
    assert.ok(!text.includes(entity))
    assert.ok(!text.includes('PRIVATE DRAFT'))
  })
  await verify('CMS, GraphQL and preview routes do not exist on public read host',async()=>{
    for (const path of [
      '/api/editorial-drafts','/api/editorial-drafts/'+draft.id,
      '/graphql','/admin','/preview?draft=true',
      '/v1/entries/'+entity+'/draft','/v1/entries/'+entity+'/_versions',
    ]) {
      assert.equal((await get(path)).status,404,path)
    }
  })
  await verify('Public read host refuses HTTP mutations',async()=>{
    for(const method of ['POST','PATCH','PUT','DELETE']){
      assert.equal((await get('/v1/entries/'+entity,{method})).status,405)
    }
  })
  await verify('Unapproved revision still cannot be published by admin connection',async()=>{
    await assert.rejects(admin.query('SELECT kg.publish($1,$2,$3)',[entity,revision,0]),/NOT_APPROVED/)
  })
  await admin.query('INSERT INTO kg.approvals(revision_id,reviewer) VALUES($1,$2)',[revision,'synthetic-reviewer'])
  await admin.query('SELECT kg.publish($1,$2,$3)',[entity,revision,0])
  await verify('Approved revision is served over actual localhost HTTP, not CMS draft',async()=>{
    const page=await asJson('/v1/entries/'+entity)
    assert.equal(page.status,200)
    assert.equal(page.content.body,approvedText)
    assert.equal(page.content.revision_id,revision)
    assert.equal(page.headers.get('cache-control'),'no-store')
    assert.ok(!JSON.stringify(page.content).includes('PRIVATE DRAFT'))
  })
  await verify('Sitemap now includes exactly the approved entity',async()=>{
    const res=await get('/v1/sitemap.xml')
    const xml=await res.text()
    assert.equal((xml.match(new RegExp(entity,'g'))||[]).length,1)
  })
  await verify('Unprocessed outbox event does not invent a searchable public record',async()=>{
    const r=await asJson('/v1/search?q='+encodeURIComponent('test idea'))
    assert.deepEqual(r.content.results,[])
  })
  const outbox=(await admin.query('SELECT id FROM kg.outbox WHERE entity_id=$1',[entity])).rows[0].id
  await admin.query('SELECT kg.project_event($1)',[outbox])
  await verify('Approved, projected content is searchable over HTTP',async()=>{
    const result=await asJson('/v1/search?q='+encodeURIComponent('test idea'))
    assert.equal(result.status,200)
    assert.equal(result.content.results.length,1)
    assert.equal(result.content.results[0].revision_id,revision)
    assert.equal(result.content.results[0].body,approvedText)
  })
  await verify('Explicit draft=true and guessed editor ID never disclose the draft',async()=>{
    const paths=[
      '/v1/entries/'+entity+'?draft=true',
      '/v1/search?q='+encodeURIComponent('PRIVATE DRAFT'),
      '/api/editorial-drafts/'+draft.id+'?depth=10',
      '/v1/entries/'+entity+'?preview=true'
    ]
    for(const path of paths){
      const response=await get(path)
      const body=await response.text()
      assert.ok(!body.includes('PRIVATE DRAFT'),path)
      assert.ok(!body.includes(draftText),path)
    }
  })
  await verify('Search projection tampering does not leak orphaned material',async()=>{
    await admin.query("UPDATE kg.search_projection SET body='PRIVATE INJECTED BODY' WHERE entity_id=$1",[entity])
    const a=await asJson('/v1/search?q=PRIVATE')
    assert.deepEqual(a.content.results,[])
    // The outbox consumer can reconstruct the projection from the immutable head.
    await admin.query('SELECT kg.project_event($1)',[outbox])
    const b=await asJson('/v1/search?q='+encodeURIComponent('test idea'))
    assert.equal(b.content.results.length,1)
    assert.equal(b.content.results[0].body,approvedText)
  })
  await verify('Later draft change does not alter HTTP response or sitemap',async()=>{
    await payload.update({collection:'editorial-drafts',id:draft.id,draft:true,data:{body:draftText+' changed'}})
    const page=await asJson('/v1/entries/'+entity)
    assert.equal(page.content.body,approvedText)
    const r=await asJson('/v1/search?q=PRIVATE')
    assert.deepEqual(r.content.results,[])
  })
  console.log('G1_HTTP_RBAC_'+checks+'_CHECKS_SUCCESS')
} finally {
  await new Promise<void>((resolve)=>server.close(()=>resolve()))
  await reader.end()
  await admin.end()
  if (payload.db?.destroy) await Promise.race([
    payload.db.destroy(),new Promise(resolve=>setTimeout(resolve,3000))
  ])
  clearTimeout(WATCHDOG)
}
process.exit(0)
