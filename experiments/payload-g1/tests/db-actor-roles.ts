import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'

const required = ['DATABASE_URL', 'G1_EDITOR_DATABASE_URL', 'G1_REVIEWER_DATABASE_URL',
  'G1_PUBLISHER_DATABASE_URL', 'PUBLIC_DATABASE_URL']
for (const key of required) {
  if (!process.env[key]) throw new Error('Required isolated CI database credential missing: '+key)
}
const admin = new Pool({connectionString: process.env.DATABASE_URL})
const editor = new Pool({connectionString: process.env.G1_EDITOR_DATABASE_URL})
const reviewer = new Pool({connectionString: process.env.G1_REVIEWER_DATABASE_URL})
const publisher = new Pool({connectionString: process.env.G1_PUBLISHER_DATABASE_URL})
const reader = new Pool({connectionString: process.env.PUBLIC_DATABASE_URL})
const entity = randomUUID(), revision = randomUUID(), bare = randomUUID(), source = randomUUID()
let passed = 0
async function check(label: string, fn: () => Promise<void>) {
  await fn()
  console.log('PASS / '+label)
  passed++
}
async function deny(pool: Pool, sql: string, params: unknown[] = [], expected = /permission denied|insufficient privilege/i) {
  await assert.rejects(pool.query(sql,params),expected)
}
try {
  await admin.query('INSERT INTO kg.entities(id,kind,name) VALUES($1,$2,$3)',
    [entity,'concept','Synthetic role-separated topic'])
  await admin.query('INSERT INTO kg.sources(id,locator,description) VALUES($1,$2,$3)',
    [source,'urn:synthetic:roles:'+source,'Not real evidence'])
  await admin.query('INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES($1,$2,$3,$4)',
    [revision,entity,'en','Synthetic role test: paper introduced a test idea.'])
  await admin.query('INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES($1,$2,$3,$4)',
    [bare,entity,'en','No claims for unreviewed revision.'])
  await admin.query('INSERT INTO kg.claims(revision_id,claim_key,anchor,statement) VALUES($1,$2,$3,$4)',
    [revision,'claim-1','p1','paper introduced a test idea'])
  await admin.query(
    'INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) VALUES($1,$2,$3,$4,$5,$6)',
    [revision,'claim-1',source,'supports','synthetic-1','fixture-only'])
  await check('All three application actors authenticate with distinct DB identities',async()=>{
    assert.equal((await editor.query('SELECT current_user AS actor')).rows[0].actor,'kg_g1_editor_probe')
    assert.equal((await reviewer.query('SELECT current_user AS actor')).rows[0].actor,'kg_g1_reviewer_probe')
    assert.equal((await publisher.query('SELECT current_user AS actor')).rows[0].actor,'kg_g1_publisher_probe')
  })
  await check('Editor cannot read private KG revisions',async()=>{
    await deny(editor,'SELECT id FROM kg.revisions LIMIT 1',[],/permission denied/i)
  })
  await check('Editor cannot self-approve a revision',async()=>{
    await deny(editor,'SELECT kg.approve_revision($1)',[revision],/permission denied/i)
  })
  await check('Editor cannot publish an approved KG revision',async()=>{
    await deny(editor,'SELECT kg.publish($1,$2,$3)',[entity,revision,0],/permission denied/i)
  })
  await check('Reviewer can read a specific revision and evidence',async()=>{
    const v=await reviewer.query('SELECT id,body FROM kg.revisions WHERE id=$1',[revision])
    assert.equal(v.rows.length,1)
    const e=await reviewer.query('SELECT claim_key,stance FROM kg.claim_evidence WHERE revision_id=$1',[revision])
    assert.equal(e.rows.length,1)
  })
  await check('Publisher cannot directly inspect private KG revisions',async()=>{
    await deny(publisher,'SELECT id FROM kg.revisions LIMIT 1')
  })
  await check('Publisher cannot approve their own publication',async()=>{
    await deny(publisher,'SELECT kg.approve_revision($1)',[revision])
  })
  await check('Reviewer cannot publish while using a review identity',async()=>{
    await deny(reviewer,'SELECT kg.publish($1,$2,$3)',[entity,revision,0])
  })
  await check('Publisher cannot release before distinct reviewer approval',async()=>{
    await deny(publisher,'SELECT kg.publish($1,$2,$3)',[entity,revision,0],/NOT_APPROVED/)
    const noHead=(await admin.query('SELECT count(*)::integer n FROM kg.heads WHERE entity_id=$1',[entity])).rows[0].n
    assert.equal(noHead,0)
  })
  await check('Reviewer cannot approve an unsupported revision',async()=>{
    await deny(reviewer,'SELECT kg.approve_revision($1)',[bare],/APPROVAL_REQUIRES_CLAIMS/)
    const n=(await admin.query('SELECT count(*)::integer n FROM kg.approvals WHERE revision_id=$1',[bare])).rows[0].n
    assert.equal(n,0)
  })
  await check('Reviewer can explicitly approve revision-bound evidence',async()=>{
    await reviewer.query('SELECT kg.approve_revision($1)',[revision])
    const a=(await admin.query('SELECT reviewer FROM kg.approvals WHERE revision_id=$1',[revision])).rows[0]
    assert.equal(a.reviewer,'kg_g1_reviewer_probe')
  })
  await check('Immutable audit captures the actual reviewer PostgreSQL login',async()=>{
    const a=(await admin.query('SELECT reviewer_login FROM kg.approval_audit WHERE revision_id=$1',[revision])).rows[0]
    assert.equal(a.reviewer_login,'kg_g1_reviewer_probe')
  })
  await check('Reviewer cannot silently edit approval audit',async()=>{
    await deny(reviewer,'UPDATE kg.approval_audit SET reviewer_login=$1 WHERE revision_id=$2',
      ['forged-reviewer',revision])
  })
  await check('Reviewer cannot mutate approved claim or revision',async()=>{
    await deny(reviewer,'UPDATE kg.claims SET statement=$1 WHERE revision_id=$2',
      ['forged-claim',revision])
    await deny(reviewer,'UPDATE kg.revisions SET body=$1 WHERE id=$2',
      ['forged-revision',revision])
  })
  await check('Publisher can release only an approved immutable revision',async()=>{
    const publish=await publisher.query('SELECT kg.publish($1,$2,$3) AS version',[entity,revision,0])
    assert.equal(Number(publish.rows[0].version),1)
    const h=await admin.query('SELECT revision_id,version FROM kg.public_entries WHERE entity_id=$1',[entity])
    assert.equal(h.rows[0].revision_id,revision)
    assert.equal(Number(h.rows[0].version),1)
  })
  await check('Publisher cannot bypass coordinator with direct head updates',async()=>{
    await deny(publisher,'UPDATE kg.heads SET version=500 WHERE entity_id=$1',[entity])
  })
  await check('Public reader cannot approve or publish even with known IDs',async()=>{
    await deny(reader,'SELECT kg.approve_revision($1)',[revision])
    await deny(reader,'SELECT kg.publish($1,$2,$3)',[entity,revision,1])
  })
  await check('Reviewer cannot re-approve or rewrite immutable audit history',async()=>{
    await deny(reviewer,'SELECT kg.approve_revision($1)',[revision],/duplicate key|unique constraint/i)
  })
  const row=(await admin.query('SELECT count(*)::integer n FROM kg.outbox WHERE entity_id=$1',[entity])).rows[0]
  assert.equal(row.n,1)
  console.log('G1_ACTOR_SEPARATION_'+passed+'_CHECKS_SUCCESS')
} finally {
  await Promise.all([admin.end(),editor.end(),reviewer.end(),publisher.end(),reader.end()])
}
