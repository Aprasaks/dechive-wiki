import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'

const BASE = 'http://127.0.0.1:3101'
const db = new Pool({ connectionString: process.env.DATABASE_URL })
const guard = setTimeout(()=>{console.error('G1_PROD_SMOKE_TIMEOUT');process.exit(124)},150000)
let checks=0
let recentLog=''
async function check(label:string, fn:()=>Promise<void>){
  await fn()
  checks++
  console.log('PASS / '+label)
}
async function request(path:string, init:RequestInit={}){
  const r=await fetch(BASE+path,{redirect:'manual',signal:AbortSignal.timeout(15000),...init})
  const body=await r.text()
  return {status:r.status,body,headers:r.headers}
}
const proc=spawn(process.execPath,[
  './node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3101'
],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'},
  stdio:['ignore','pipe','pipe'],detached:true})
proc.stdout.on('data',(part:Buffer)=>{recentLog=(recentLog+part.toString()).slice(-10000)})
proc.stderr.on('data',(part:Buffer)=>{recentLog=(recentLog+part.toString()).slice(-10000)})
async function ready(){
  const deadline=Date.now()+60000
  while(Date.now()<deadline){
    if(proc.exitCode!==null)throw new Error('Compiled Next.js exited: '+recentLog.slice(-3000))
    try{const r=await fetch(BASE+'/',{signal:AbortSignal.timeout(2000)});if(r.status===200)return}catch{}
    await new Promise(r=>setTimeout(r,1000))
  }
  throw new Error('Compiled Next.js server not ready: '+recentLog.slice(-4000))
}
try{
  await ready()
  console.log('G1_NEXT_PRODUCTION: compiled next start is serving loopback HTTP')
  const head=(await db.query('SELECT entity_id,body,revision_id FROM kg.public_entries ORDER BY entity_id LIMIT 1')).rows[0]
  assert.ok(head?.entity_id,'Previous dev full-flow test must leave an approved head')
  const id=head.entity_id as string
  const draftText='PRIVATE UNSCREENED MATERIAL'
  await check('Compiled Next.js homepage responds in production mode',async()=>{
    const r=await request('/')
    assert.equal(r.status,200)
    assert.ok(r.body.includes('The Living Knowledge Archive'))
    assert.ok(!r.body.includes(draftText))
  })
  await check('Compiled production knowledge page shows approved immutable body',async()=>{
    const r=await request('/knowledge/'+id)
    assert.equal(r.status,200,r.body.slice(0,350))
    assert.ok(r.body.includes(head.body))
    assert.ok(!r.body.includes(draftText))
  })
  await check('Compiled production cannot preview private draft via query parameters',async()=>{
    const r=await request('/knowledge/'+id+'?draft=true&preview=true')
    assert.equal(r.status,200)
    assert.ok(r.body.includes(head.body))
    assert.ok(!r.body.includes(draftText))
    assert.match(r.headers.get('cache-control')??'',/no-store/)
  })
  await check('Unapproved or unknown entity remains 404 after production build',async()=>{
    const r=await request('/knowledge/'+randomUUID()+'?draft=true')
    assert.equal(r.status,404)
    assert.ok(!r.body.includes(draftText))
  })
  await check('Compiled production sitemap contains approved head only',async()=>{
    const r=await request('/sitemap.xml')
    assert.equal(r.status,200)
    assert.ok(r.body.includes(id))
    assert.ok(!r.body.includes(draftText))
    assert.match(r.headers.get('cache-control')??'',/no-store/)
  })
  await check('Compiled production studio redirects anonymous requests to sign-in',async()=>{
    const r=await request('/studio')
    assert.ok([302,303,307,308].includes(r.status),'Anonymous studio HTTP '+r.status)
    assert.match(r.headers.get('location')??'',/\/studio\/login/)
    assert.match(r.headers.get('cache-control')??'',/no-store/)
  })
  await check('Compiled production staff login page is non-indexable and framed-denied',async()=>{
    const r=await request('/studio/login')
    assert.equal(r.status,200,r.body.slice(0,250))
    assert.match(r.body,/Editorial Sign In/)
    assert.match(r.headers.get('x-robots-tag')??'',/noindex/)
    assert.equal(r.headers.get('x-frame-options'),'DENY')
  })
  await check('Compiled Payload REST collection does not reveal drafts to guests',async()=>{
    const r=await request('/api/editorial-drafts?draft=true&depth=99')
    assert.ok(r.status<500,r.body.slice(0,250))
    assert.ok(!r.body.includes(draftText))
    assert.ok(!r.body.includes(head.body))
    assert.match(r.headers.get('cache-control')??'',/no-store/)
    assert.match(r.headers.get('x-robots-tag')??'',/noindex/)
  })
  await check('Compiled Payload GraphQL does not reveal private drafts to guests',async()=>{
    const r=await request('/api/graphql',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query:'{ EditorialDrafts { docs { id body } } }'})})
    assert.ok(r.status<500,r.body.slice(0,250))
    assert.ok(!r.body.includes(draftText))
  })
  await check('Compiled production approval endpoint rejects anonymous requests',async()=>{
    const r=await request('/api/g1-approve',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({draftId:1,revisionId:head.revision_id})})
    assert.equal(r.status,403,r.body.slice(0,250))
  })
  await check('Compiled production publisher endpoint rejects anonymous requests',async()=>{
    const r=await request('/api/g1-publish',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({entityId:id,revisionId:head.revision_id,expectedVersion:1})})
    assert.equal(r.status,403,r.body.slice(0,250))
  })
  await check('Production app excludes unprotected admin and preview routes',async()=>{
    for(const p of ['/admin','/preview?draft=true','/graphql-playground']){
      const r=await request(p)
      assert.equal(r.status,404,p)
    }
  })
  await check('Production robots explicitly suppresses test-lab indexing',async()=>{
    const r=await request('/robots.txt')
    assert.equal(r.status,200)
    assert.match(r.body,/Disallow: \//)
  })
  console.log('G1_COMPILED_NEXT_PROD_'+checks+'_CHECKS_SUCCESS')
}catch(error){
  console.error('G1_PROD_SERVER_CONTEXT',recentLog.slice(-5000))
  throw error
}finally{
  await db.end()
  try{process.kill(-proc.pid!,'SIGTERM')}catch{proc.kill('SIGTERM')}
  await new Promise<void>(resolve=>{
    const timer=setTimeout(()=>{try{process.kill(-proc.pid!,'SIGKILL')}catch{};resolve()},4000)
    proc.once('exit',()=>{clearTimeout(timer);resolve()})
  })
  clearTimeout(guard)
}
process.exit(0)
