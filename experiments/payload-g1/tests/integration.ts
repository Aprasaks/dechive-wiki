import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { getPayload } from 'payload'
import config from '../payload.config.ts'

const watchdog = setTimeout(() => { console.error('G1_WATCHDOG_TIMEOUT'); process.exit(124) }, 180000)
console.log('G1_START: before Payload initialization')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const entity = randomUUID(), source = randomUUID(), revision = randomUUID()
const claim = 'paper introduced a test idea'
const approvedBody = 'Synthetic proof: paper introduced a test idea.'
const draftBody = 'Unreviewed, unsupported new interpretation.'
const payload = await getPayload({ config })
console.log('G1_INIT: Payload initialized')
let passed=0
async function check(label: string, fn: () => Promise<void>) {
  await fn(); ++passed; console.log('PASS / '+label)
}
try {
  const doc=await payload.create({collection:'editorial-drafts',draft:true,data:{
    stableEntityId:entity,title:'G1 synthetic page',body:approvedBody
  }})
  await check('Payload draft created',async()=>assert.equal(doc._status,'draft'))
  await check('CMS draft is not a KG public entry',async()=>{
    assert.equal((await pool.query('select count(*)::int n from kg.public_entries')).rows[0].n,0)
  })
  await check('Anonymous Local API list denied with overrideAccess false',async()=>{
    let denied=false
    try{
      const results=await payload.find({collection:'editorial-drafts',overrideAccess:false})
      denied = results.docs.length===0
    }catch(error){
      assert.match(String(error),/forbidden|unauthoriz|access|not allowed/i)
      denied=true
    }
    assert.equal(denied,true,'Guest unexpectedly read a private editorial document')
  })
  await check('Local API create-published explicitly refused',async()=>{
    await assert.rejects(payload.create({collection:'editorial-drafts',data:{
      stableEntityId:randomUUID(),title:'Forbidden publish',body:approvedBody,_status:'published'
    }}),/KG_PUBLICATION_GATE_REQUIRED/)
  })
  await check('Local API update-published refused even with overrideAccess true',async()=>{
    await assert.rejects(payload.update({collection:'editorial-drafts',id:doc.id,
      overrideAccess:true,data:{_status:'published'}}),/KG_PUBLICATION_GATE_REQUIRED/)
  })
  await check('draft:true cannot bypass native publish block',async()=>{
    await assert.rejects(payload.update({collection:'editorial-drafts',id:doc.id,
      draft:true,overrideAccess:true,data:{_status:'published'}}),/KG_PUBLICATION_GATE_REQUIRED/)
  })
  await check('Unauthorized draft mutation is rejected with access checks',async()=>{
    await assert.rejects(payload.update({collection:'editorial-drafts',id:doc.id,
      overrideAccess:false,data:{body:'unauthorized alteration'}}),/forbidden|unauthoriz|access|not allowed/i)
  })
  await check('Rejected publish attempts leave native document in draft state',async()=>{
    const unchanged=await payload.findByID({collection:'editorial-drafts',id:doc.id})
    assert.equal(unchanged._status,'draft')
  })
  await pool.query('insert into kg.entities(id,kind,name) values($1,$2,$3)',[entity,'concept','Synthetic G1 topic'])
  await pool.query('insert into kg.sources(id,locator,description) values($1,$2,$3)',[
    source,'urn:synthetic:g1:'+source,'Not a real-world source'
  ])
  await pool.query('insert into kg.revisions(id,entity_id,locale,body) values($1,$2,$3,$4)',[
    revision,entity,'en',approvedBody
  ])
  await pool.query('insert into kg.claims(revision_id,claim_key,anchor,statement) values($1,$2,$3,$4)',[
    revision,'c-001','paragraph-1',claim
  ])
  await pool.query('insert into kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) values($1,$2,$3,$4,$5,$6)',[
    revision,'c-001',source,'supports','fixture-section','synthetic-reviewer'
  ])
  await check('Unapproved KG revision cannot publish',async()=>{
    await assert.rejects(pool.query('select kg.publish($1,$2,$3)',[entity,revision,0]),/NOT_APPROVED/)
  })
  await pool.query('insert into kg.approvals(revision_id,reviewer) values($1,$2)',[revision,'synthetic-reviewer'])
  await check('Aborted publication transaction cannot leak head or outbox',async()=>{
    const client=await pool.connect()
    try{
      await client.query('BEGIN')
      await client.query('select kg.publish($1,$2,$3)',[entity,revision,0])
      await client.query('ROLLBACK')
    }finally{client.release()}
    assert.equal((await pool.query('select count(*)::int n from kg.public_entries')).rows[0].n,0)
    assert.equal((await pool.query('select count(*)::int n from kg.outbox')).rows[0].n,0)
  })
  await check('Approved KG revision is the only public version',async()=>{
    const v=await pool.query('select kg.publish($1,$2,$3) version',[entity,revision,0])
    assert.equal(Number(v.rows[0].version),1)
    const pub=await pool.query('select body,revision_id from kg.public_entries where entity_id=$1',[entity])
    assert.equal(pub.rows[0].body,approvedBody)
    assert.equal(pub.rows[0].revision_id,revision)
  })
  await check('Outbox projection is pinned to approved revision',async()=>{
    const out=(await pool.query('select id from kg.outbox where entity_id=$1',[entity])).rows[0]
    const projected=await pool.query('select kg.project_event($1) projected',[out.id])
    assert.equal(projected.rows[0].projected,true)
    const entry=await pool.query('select body,version from kg.search_projection where entity_id=$1',[entity])
    assert.equal(entry.rows[0].body,approvedBody)
    assert.equal(Number(entry.rows[0].version),1)
  })
  await check('Unapproved later CMS draft cannot replace public KG or search',async()=>{
    await payload.update({collection:'editorial-drafts',id:doc.id,draft:true,data:{body:draftBody}})
    const latest=await payload.findByID({collection:'editorial-drafts',id:doc.id,draft:true})
    assert.equal(latest.body,draftBody)
    assert.equal((await pool.query('select body from kg.public_entries where entity_id=$1',[entity])).rows[0].body,approvedBody)
    assert.equal((await pool.query('select body from kg.search_projection where entity_id=$1',[entity])).rows[0].body,approvedBody)
  })
  console.log('G1_REAL_PAYLOAD_POSTGRES_'+passed+'_CHECKS_SUCCESS')
} finally {
  await pool.end()
  if (payload.db?.destroy) await Promise.race([payload.db.destroy(), new Promise(resolve => setTimeout(resolve, 5000))])
}
clearTimeout(watchdog)
process.exit(0)
