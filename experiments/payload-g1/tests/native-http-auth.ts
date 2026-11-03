import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { getPayload } from 'payload'
import config from '../native-auth.config.ts'
import { nativePayloadHttp } from '../http/native-payload-http.ts'
import { publicReader } from '../http/public-reader.ts'

const guard = setTimeout(() => {
  console.error('G1_NATIVE_HTTP_TIMEOUT')
  process.exit(124)
}, 180000)
const admin = new Pool({ connectionString: process.env.DATABASE_URL })
let publicDb: Pool | undefined
const payload = await getPayload({ config })
const server = nativePayloadHttp()
let publicServer: ReturnType<typeof publicReader> | undefined
let passed = 0
async function check(label:string, fn:()=>Promise<void>) {
  await fn()
  passed++
  console.log('PASS / '+label)
}
async function listen(s:ReturnType<typeof nativePayloadHttp>) {
  await new Promise<void>((resolve,reject) => {s.once('error',reject);s.listen(0,'127.0.0.1',resolve)})
  const address=s.address()
  if(!address || typeof address==='string') throw new Error('Loopback server failed')
  return 'http://127.0.0.1:'+address.port
}
const base = await listen(server)
async function call(path:string, method='GET', data?:unknown, token?:string) {
  const response=await fetch(base+path,{
    method, redirect:'manual',
    headers:{
      ...(data===undefined?{}:{'Content-Type':'application/json'}),
      ...(token?{Authorization:'JWT '+token}:{})
    },
    ...(data===undefined?{}:{body:JSON.stringify(data)}),
  })
  const raw=await response.text()
  let json: any
  try{json=JSON.parse(raw)}catch{json={__raw:raw.slice(0,500)}}
  return {status:response.status, json, headers:response.headers}
}
function denied(result:{status:number,json:any}) {
  assert.ok([400,401,403,404,405,422].includes(result.status),
    'Expected explicit HTTP denial, got '+result.status+' '+JSON.stringify(result.json).slice(0,300))
}
function graphqlErrors(result:{status:number,json:any}) {
  assert.ok(result.status<500,'GraphQL internal server error: '+JSON.stringify(result.json).slice(0,300))
  assert.ok(Array.isArray(result.json.errors) && result.json.errors.length>0,
    'Expected GraphQL authorization errors')
  assert.ok(result.json.errors.every((e:any)=>!/cannot query field|unknown field|unknown argument|syntax error/i.test(e.message)),
    'Invalid GraphQL selection is not an authorization test')
}
async function login(email:string,password:string) {
  const result=await call('/api/staff/login','POST',{email,password})
  assert.equal(result.status,200,'Login failed: '+JSON.stringify(result.json).slice(0,300))
  assert.ok(typeof result.json.token==='string' && result.json.token.length>30)
  return result.json.token as string
}
function recordEmail(kind:string) {
  return kind+'-'+randomUUID().slice(0,8)+'@example.invalid'
}
try {
  const accounts=[
    {kind:'editor',role:'editor',email:recordEmail('editor1'),password:randomBytes(18).toString('hex')},
    {kind:'other',role:'editor',email:recordEmail('editor2'),password:randomBytes(18).toString('hex')},
    {kind:'reviewer',role:'reviewer',email:recordEmail('reviewer'),password:randomBytes(18).toString('hex')},
    {kind:'publisher',role:'publisher',email:recordEmail('publisher'),password:randomBytes(18).toString('hex')},
  ] as const
  const seeded:Record<string,any>={}
  for(const a of accounts){
    seeded[a.kind]=await payload.create({
      collection:'staff',overrideAccess:true,
      data:{email:a.email,password:a.password,role:a.role},
    })
  }
  console.log('G1_NATIVE_HTTP: Staff fixtures seeded; secrets not printed')
  const tokens:Record<string,string>={}
  await check('Real Payload REST login authenticates distinct editor/reviewer/publisher JWTs',async()=>{
    for(const a of accounts) tokens[a.kind]=await login(a.email,a.password)
    assert.equal(new Set(Object.values(tokens)).size,4)
  })
  await check('Wrong password is rejected by native REST login',async()=>{
    denied(await call('/api/staff/login','POST',{email:accounts[0].email,password:'incorrect-password'}))
  })
  await check('Anonymous native REST cannot register arbitrary staff role',async()=>{
    denied(await call('/api/staff','POST',{
      email:recordEmail('rogue'),password:'synthetic-test-not-real-password',role:'reviewer'
    }))
  })
  await check('REST authenticated current user retains server-verified role',async()=>{
    const result=await call('/api/staff/me','GET',undefined,tokens.editor)
    assert.equal(result.status,200,JSON.stringify(result.json).slice(0,300))
    assert.equal(result.json.user.role,'editor')
  })
  await check('Editor cannot self-promote role via REST PATCH',async()=>{
    denied(await call('/api/staff/'+seeded.editor.id,'PATCH',{role:'publisher'},tokens.editor))
    const user=await payload.findByID({collection:'staff',id:seeded.editor.id,overrideAccess:true})
    assert.equal(user.role,'editor')
  })
  const entity=randomUUID()
  const body='Synthetic editorial body: paper introduced a test idea.'
  let document:any
  await check('Editor can submit a native REST draft with real JWT',async()=>{
    const response=await call('/api/editorial-drafts?draft=true','POST',{
      stableEntityId:entity,title:'G1 HTTP editorial test',body,_status:'draft'
    },tokens.editor)
    assert.ok(response.status===200 || response.status===201,
      'Draft creation failed: '+JSON.stringify(response.json).slice(0,400))
    assert.equal(response.json.doc._status,'draft')
    document=response.json.doc
    assert.ok(document.id)
  })
  await check('Actual owner ID is assigned by server rather than client',async()=>{
    const item=await payload.findByID({collection:'editorial-drafts',id:document.id,overrideAccess:true,draft:true})
    assert.equal(String(item.createdBy?.id??item.createdBy),String(seeded.editor.id))
  })
  await check('Anonymous REST cannot enumerate drafts with draft=true or depth=10',async()=>{
    const response=await call('/api/editorial-drafts?draft=true&depth=10')
    if(response.status===200){
      assert.equal(response.json.docs?.length,0)
    }else denied(response)
  })
  await check('Anonymous REST direct document ID request is denied',async()=>{
    const response=await call('/api/editorial-drafts/'+document.id+'?draft=true')
    if(response.status===200) assert.ok(!JSON.stringify(response.json).includes(body))
    else denied(response)
  })
  await check('Second editor cannot enumerate or read another editor draft',async()=>{
    const list=await call('/api/editorial-drafts?draft=true', 'GET',undefined,tokens.other)
    if(list.status===200)assert.equal(list.json.docs?.length,0)
    else denied(list)
    const direct=await call('/api/editorial-drafts/'+document.id+'?draft=true','GET',undefined,tokens.other)
    if(direct.status===200) assert.ok(!JSON.stringify(direct.json).includes(body))
    else denied(direct)
  })
  await check('Reviewer can read but cannot update editor draft via REST',async()=>{
    const response=await call('/api/editorial-drafts/'+document.id+'?draft=true','GET',undefined,tokens.reviewer)
    assert.equal(response.status,200,JSON.stringify(response.json).slice(0,300))
    assert.equal(response.json.body,body)
    denied(await call('/api/editorial-drafts/'+document.id,'PATCH',{body:'Reviewer edit attempted'},tokens.reviewer))
  })
  await check('Editor cannot directly set native Payload _status=published',async()=>{
    denied(await call('/api/editorial-drafts/'+document.id,'PATCH',{
      _status:'published',body:'Bypass native publication'
    },tokens.editor))
    const existing=await payload.findByID({collection:'editorial-drafts',id:document.id,overrideAccess:true})
    assert.equal(existing._status,'draft')
  })
  await check('Publisher cannot edit CMS drafts via REST',async()=>{
    denied(await call('/api/editorial-drafts/'+document.id,'PATCH',{body:'Publisher edit'},tokens.publisher))
    denied(await call('/api/editorial-drafts','POST',{
      stableEntityId:randomUUID(),title:'Publisher forged draft',body:'forged'
    },tokens.publisher))
  })
  await check('Native REST versions list is disabled even with reviewer session',async()=>{
    const result=await call('/api/editorial-drafts/versions','GET',undefined,tokens.reviewer)
    if(result.status===200)assert.equal(result.json.docs?.length,0)
    else denied(result)
  })
  await check('Anonymous REST version restore is denied',async()=>{
    const v=await payload.findVersions({collection:'editorial-drafts',overrideAccess:true})
    assert.ok(v.docs.length>0,'Version fixture absent')
    const attempt=await call('/api/editorial-drafts/versions/'+v.docs[0].id,'POST',{},undefined)
    denied(attempt)
  })
  const gqlQuery='{ EditorialDrafts { docs { id title body } } }'
  await check('Authenticated reviewer can read real generated Payload GraphQL schema',async()=>{
    const resp=await call('/api/graphql','POST',{query:gqlQuery},tokens.reviewer)
    assert.equal(resp.status,200,JSON.stringify(resp.json).slice(0,400))
    assert.ok(!resp.json.errors?.length,JSON.stringify(resp.json).slice(0,400))
    const docs=resp.json.data?.EditorialDrafts?.docs
    assert.ok(Array.isArray(docs))
    assert.ok(docs.some((d:any)=>d.body===body))
  })
  await check('Anonymous GraphQL cannot read private draft body',async()=>{
    const resp=await call('/api/graphql','POST',{query:gqlQuery})
    assert.ok(resp.status<500)
    const str=JSON.stringify(resp.json)
    assert.ok(!str.includes(body))
    if(resp.json.errors)graphqlErrors(resp)
    else assert.equal(resp.json.data?.EditorialDrafts?.docs?.length??0,0)
  })
  await check('Other editor GraphQL cannot query owner draft',async()=>{
    const resp=await call('/api/graphql','POST',{query:gqlQuery},tokens.other)
    assert.ok(resp.status<500)
    assert.ok(!JSON.stringify(resp.json).includes(body))
    if(resp.json.errors)graphqlErrors(resp)
    else assert.equal(resp.json.data?.EditorialDrafts?.docs?.length??0,0)
  })
  await check('Payload native GET and GraphQL cannot create a public KG head',async()=>{
    const result=await admin.query('SELECT count(*)::int n FROM kg.public_entries')
    assert.equal(result.rows[0].n,0)
  })
  // The canonical Knowledge Core is deliberately separate from CMS internal data.
  // Seed a revision bound to the editor's exact HTTP-submitted body as a fixture.
  const source=randomUUID(),revision=randomUUID()
  await admin.query('INSERT INTO kg.entities(id,kind,name) VALUES($1,$2,$3)',
    [entity,'concept','Editorial workflow synthetic entity'])
  await admin.query('INSERT INTO kg.sources(id,locator,description) VALUES($1,$2,$3)',
    [source,'urn:synthetic:g1-native:'+source,'CI-only synthetic source'])
  await admin.query('INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES($1,$2,$3,$4)',
    [revision,entity,'en',body])
  await admin.query('INSERT INTO kg.claims(revision_id,claim_key,anchor,statement) VALUES($1,$2,$3,$4)',
    [revision,'claim-1','p1','paper introduced a test idea'])
  await admin.query('INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) VALUES($1,$2,$3,$4,$5,$6)',
    [revision,'claim-1',source,'supports','synthetic-fixture','CI-fake-reviewer'])
  const approveRequest={draftId:document.id,revisionId:revision}
  const publishRequest={entityId:entity,revisionId:revision,expectedVersion:0}
  await check('Anonymous cannot invoke real reviewer approval endpoint',async()=>{
    denied(await call('/api/g1-approve','POST',approveRequest))
  })
  await check('Editor cannot impersonate reviewer using a forged role field',async()=>{
    denied(await call('/api/g1-approve','POST',{...approveRequest,role:'reviewer'},tokens.editor))
  })
  await check('Publisher account cannot approve a revision over HTTP',async()=>{
    denied(await call('/api/g1-approve','POST',approveRequest,tokens.publisher))
  })
  await check('Reviewer cannot publish from a genuine reviewer JWT',async()=>{
    denied(await call('/api/g1-publish','POST',publishRequest,tokens.reviewer))
  })
  await check('Editor cannot publish from a genuine editor JWT',async()=>{
    denied(await call('/api/g1-publish','POST',publishRequest,tokens.editor))
  })
  await check('Publisher endpoint rejects unapproved revision without exposing KG details',async()=>{
    const result=await call('/api/g1-publish','POST',publishRequest,tokens.publisher)
    assert.equal(result.status,409,JSON.stringify(result.json).slice(0,300))
    assert.equal((await admin.query('SELECT count(*)::int n FROM kg.public_entries')).rows[0].n,0)
  })
  await check('Reviewer cannot approve a revision that differs from editor submitted draft',async()=>{
    const mismatched=randomUUID()
    await admin.query('INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES($1,$2,$3,$4)',
      [mismatched,entity,'en','mismatched text'])
    const result=await call('/api/g1-approve','POST',
      {draftId:document.id,revisionId:mismatched},tokens.reviewer)
    assert.equal(result.status,409,JSON.stringify(result.json).slice(0,300))
  })
  await check('Valid reviewer JWT approves only the exact revision and evidence bound to the draft',async()=>{
    const result=await call('/api/g1-approve','POST',approveRequest,tokens.reviewer)
    assert.equal(result.status,200,JSON.stringify(result.json).slice(0,400))
    assert.equal(result.json.approved,true)
    const audit=await admin.query('SELECT reviewer_login FROM kg.approval_audit WHERE revision_id=$1',[revision])
    assert.equal(audit.rows[0].reviewer_login,'kg_g1_reviewer_probe')
  })
  await check('Approval cannot be replayed to rewrite immutable audit',async()=>{
    const replay=await call('/api/g1-approve','POST',approveRequest,tokens.reviewer)
    assert.equal(replay.status,409,JSON.stringify(replay.json).slice(0,300))
  })
  await check('Actual publisher JWT releases approved KG head via restricted DB role',async()=>{
    const published=await call('/api/g1-publish','POST',publishRequest,tokens.publisher)
    assert.equal(published.status,200,JSON.stringify(published.json).slice(0,400))
    assert.equal(published.json.published,true)
    assert.equal(published.json.version,1)
  })
  await check('Publisher cannot replay stale head version',async()=>{
    const replay=await call('/api/g1-publish','POST',publishRequest,tokens.publisher)
    assert.equal(replay.status,409,JSON.stringify(replay.json).slice(0,300))
  })
  await check('Canonical approved snapshot exactly matches REST-authored draft content',async()=>{
    const result=await admin.query('SELECT revision_id,body FROM kg.public_entries WHERE entity_id=$1',[entity])
    assert.equal(result.rows[0].revision_id,revision)
    assert.equal(result.rows[0].body,body)
  })
  await check('Later private editor edits do not change immutable approved Knowledge Core head',async()=>{
    const updated=await call('/api/editorial-drafts/'+document.id+'?draft=true','PATCH',
      {body:'PRIVATE NEW DRAFT: unsupported claims'},tokens.editor)
    assert.ok(updated.status===200,JSON.stringify(updated.json).slice(0,250))
    const approved=await admin.query('SELECT body FROM kg.public_entries WHERE entity_id=$1',[entity])
    assert.equal(approved.rows[0].body,body)
  })
  if(process.env.PUBLIC_DATABASE_URL){
    publicDb=new Pool({connectionString:process.env.PUBLIC_DATABASE_URL})
    publicServer=publicReader(publicDb)
    const url=await listen(publicServer)
    await check('Authenticated editorial draft never leaks through the separate public-only HTTP API',async()=>{
      const result=await fetch(url+'/v1/entries/'+entity+'?draft=true')
      assert.equal(result.status,200)
      const text=await result.text()
      assert.ok(text.includes(body))
      assert.ok(!text.includes('PRIVATE NEW DRAFT'))
    })
  }
  console.log('G1_NATIVE_PAYLOAD_HTTP_'+passed+'_CHECKS_SUCCESS')
} finally {
  await new Promise<void>(resolve=>server.close(()=>resolve()))
  if(publicServer)await new Promise<void>(resolve=>publicServer!.close(()=>resolve()))
  if(publicDb)await publicDb.end()
  await admin.end()
  if(payload.db?.destroy)await Promise.race([payload.db.destroy(),new Promise(resolve=>setTimeout(resolve,4000))])
  clearTimeout(guard)
}
process.exit(0)
