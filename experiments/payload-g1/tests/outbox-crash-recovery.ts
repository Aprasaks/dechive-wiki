import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 })
const entity = randomUUID()
const source = randomUUID()
const v1 = randomUUID()
const v2 = randomUUID()
const phrase = 'paper introduced a test idea'
let passed = 0
const watchdog = setTimeout(() => {
  console.error('G1_CRASH_WATCHDOG_EXPIRED')
  process.exit(124)
}, 120000)

async function check(name: string, fn: () => Promise<void>) {
  await fn()
  passed++
  console.log('PASS / ' + name)
}
async function one(sql: string, params: unknown[] = []) {
  return (await pool.query(sql, params)).rows[0]
}
async function addRevision(id: string, body: string) {
  await pool.query('INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES($1,$2,$3,$4)',
    [id, entity, 'en', body])
  await pool.query('INSERT INTO kg.claims(revision_id,claim_key,anchor,statement) VALUES($1,$2,$3,$4)',
    [id, 'claim-1', 'p-1', phrase])
  await pool.query(
    'INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) VALUES($1,$2,$3,$4,$5,$6)',
    [id, 'claim-1', source, 'supports', 'synthetic-test', 'fixture-only'])
  await pool.query('INSERT INTO kg.approvals(revision_id,reviewer) VALUES($1,$2)',
    [id, 'fixture-only'])
}
function start(operation: string, args: string[], mode: string) {
  return spawn(TSX, ['tests/outbox-worker.ts', operation, ...args, mode], {
    cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
  })
}
async function killAt(operation: string, args: string[], phase: 'before'|'after') {
  const child = start(operation, args, phase === 'before' ? 'pause-before-commit' : 'pause-after-commit')
  const desired = phase === 'before' ? 'READY_BEFORE_COMMIT' : 'READY_AFTER_COMMIT'
  let stdout = '', stderr = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  const closed = new Promise<{ code: number|null; signal: NodeJS.Signals|null }>(resolve =>
    child.once('close', (code, signal) => resolve({code, signal})))
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Worker marker timeout: '+stdout+' '+stderr)), 20000)
      child.stdout.on('data', (part: Buffer) => {
        stdout += part.toString()
        if (stdout.includes(desired)) resolve()
      })
      child.stderr.on('data', (part: Buffer) => { stderr += part.toString() })
      child.once('error', reject)
      child.once('close', () => {
        if (!stdout.includes(desired)) reject(new Error('Worker exited before marker: '+stdout+' '+stderr))
      })
    })
    assert.equal(child.kill('SIGKILL'), true)
    const result = await closed
    assert.equal(result.signal, 'SIGKILL', 'Must have killed real child process')
  } finally {
    if (timer) clearTimeout(timer)
    if (!child.killed && child.exitCode === null) child.kill('SIGKILL')
  }
}
async function commit(operation: string, args: string[]) {
  const child = start(operation, args, 'commit')
  let stdout = '', stderr = ''
  child.stdout.on('data', (part: Buffer) => { stdout += part.toString() })
  child.stderr.on('data', (part: Buffer) => { stderr += part.toString() })
  const result = await new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve =>
    child.once('close', (code,signal) => resolve({code,signal})))
  assert.equal(result.code, 0, 'Worker failed: '+stdout+' '+stderr)
  assert.match(stdout, /WORKER_COMMIT_OK/)
}
try {
  await pool.query('INSERT INTO kg.entities(id,kind,name) VALUES($1,$2,$3)',
    [entity, 'concept', 'G1 synthetic crash-fixture concept'])
  await pool.query('INSERT INTO kg.sources(id,locator,description) VALUES($1,$2,$3)',
    [source, 'urn:synthetic:g1-crash:'+source, 'Not a real source'])
  await addRevision(v1, 'Synthetic first revision: paper introduced a test idea.')

  await check('Approved but unpublished revision has no public head', async () => {
    assert.equal((await one('SELECT count(*)::int n FROM kg.heads WHERE entity_id=$1',[entity])).n, 0)
  })
  await check('Real SIGKILL before publication COMMIT leaves no head, snapshot or outbox', async () => {
    await killAt('publish', [entity,v1,'0'], 'before')
    for (const table of ['heads','snapshots','outbox']) {
      assert.equal((await one('SELECT count(*)::int n FROM kg.'+table+' WHERE entity_id=$1',[entity])).n, 0, table)
    }
  })
  await check('After interruption, publication can be safely retried', async () => {
    await commit('publish', [entity,v1,'0'])
    assert.equal(Number((await one('SELECT version FROM kg.heads WHERE entity_id=$1',[entity])).version),1)
    assert.equal((await one('SELECT count(*)::int n FROM kg.outbox WHERE entity_id=$1',[entity])).n,1)
  })
  const event1 = String((await one('SELECT id FROM kg.outbox WHERE entity_id=$1',[entity])).id)

  await check('Real SIGKILL before search projection COMMIT rolls back all writes', async () => {
    await killAt('project',[event1],'before')
    assert.equal((await one('SELECT count(*)::int n FROM kg.search_projection WHERE entity_id=$1',[entity])).n,0)
    assert.equal((await one('SELECT processed FROM kg.outbox WHERE id=$1',[event1])).processed,false)
  })
  await check('Real SIGKILL after projection COMMIT preserves durable writes',async()=>{
    await killAt('project',[event1],'after')
    const row = await one('SELECT version,revision_id FROM kg.search_projection WHERE entity_id=$1',[entity])
    assert.equal(Number(row.version),1)
    assert.equal(row.revision_id,v1)
    assert.equal((await one('SELECT processed FROM kg.outbox WHERE id=$1',[event1])).processed,true)
  })
  await check('Redelivery after lost acknowledgement leaves exactly one correct projection',async()=>{
    await commit('project',[event1])
    const row=await one('SELECT version,revision_id FROM kg.search_projection WHERE entity_id=$1',[entity])
    assert.equal(Number(row.version),1)
    assert.equal(row.revision_id,v1)
    assert.equal((await one('SELECT count(*)::int n FROM kg.search_projection WHERE entity_id=$1',[entity])).n,1)
  })

  await addRevision(v2,'Synthetic corrected second revision: paper introduced a test idea.')
  await check('New published head hides stale search results before projection catches up',async()=>{
    await commit('publish',[entity,v2,'1'])
    assert.equal((await one('SELECT count(*)::int n FROM kg.public_search_verified WHERE entity_id=$1',[entity])).n,0)
    assert.equal((await one('SELECT revision_id FROM kg.public_entries WHERE entity_id=$1',[entity])).revision_id,v2)
  })
  const event2=String((await one('SELECT id FROM kg.outbox WHERE entity_id=$1 AND version=2',[entity])).id)
  await check('Out-of-order old event cannot overwrite newer approved search',async()=>{
    await commit('project',[event2])
    const stale=await one('SELECT kg.project_event($1) applied',[event1])
    assert.equal(stale.applied,false)
    const entry=await one('SELECT version,revision_id FROM kg.public_search_verified WHERE entity_id=$1',[entity])
    assert.equal(Number(entry.version),2)
    assert.equal(entry.revision_id,v2)
  })
  console.log('G1_PROCESS_CRASH_'+passed+'_CHECKS_SUCCESS')
} finally {
  await pool.end()
  clearTimeout(watchdog)
}
process.exit(0)
