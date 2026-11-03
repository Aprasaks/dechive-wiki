import assert from 'node:assert/strict'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Pool } from 'pg'
import { getPayload } from 'payload'
import config from '../native-auth.config.ts'

const BASE = 'http://127.0.0.1:3100'
const admin = new Pool({ connectionString: process.env.DATABASE_URL })
const reviewerProbe = new Pool({ connectionString: process.env.G1_REVIEWER_DATABASE_URL })
const accounts = [
  { key: 'editor', role: 'editor' },
  { key: 'other', role: 'editor' },
  { key: 'reviewer', role: 'reviewer' },
  { key: 'publisher', role: 'publisher' },
].map(x=>({...x, email:x.key+'-'+randomUUID().slice(0,8)+'@example.invalid',
    password:randomBytes(24).toString('hex')}))
let passed=0
let nextLog=''
const watchdog=setTimeout(()=>{
  console.error('FULL_NEXT_TEST_TIMEOUT')
  process.exit(124)
}, 270000)

async function check(label:string, task:()=>Promise<void>) {
  await task()
  passed++
  console.log('PASS / '+label)
}
async function fetchRaw(path:string, method='GET', data?:unknown, token?:string) {
  const response=await fetch(BASE+path,{
    method, redirect:'manual', signal:AbortSignal.timeout(12000),
    headers:{
      ...(data===undefined?{}:{'Content-Type':'application/json'}),
      ...(token?{'Authorization':'JWT '+token}:{})
    },
    ...(data===undefined?{}:{body:JSON.stringify(data)}),
  })
  const text=await response.text()
  let json:any
  try{json=JSON.parse(text)}catch{json=null}
  return {status:response.status,text,json,headers:response.headers}
}
function denied(x:{status:number,text:string}) {
  assert.ok([400,401,403,404,405,409,422].includes(x.status),
    'Expected deny status, got '+x.status+' '+x.text.slice(0,300))
}
async function waitServer(processRef:ReturnType<typeof spawn>) {
  const deadline=Date.now()+110000
  while(Date.now()<deadline){
    if(processRef.exitCode!==null)throw new Error('Next exited during startup: '+nextLog.slice(-3000))
    try {
      const res=await fetch(BASE+'/',{signal:AbortSignal.timeout(1500)})
      if(res.status===200)return
    }catch{}
    await new Promise(r=>setTimeout(r,1000))
  }
  throw new Error('Next.js HTTP listener did not become healthy: '+nextLog.slice(-4000))
}

const seed = await getPayload({config})
console.log('G1_NEXT: seeding four separate authenticated accounts, no real credentials')
const seededAccounts:Record<string,{id:string|number}>={}
for(const a of accounts){
  seededAccounts[a.key]=await seed.create({collection:'staff',overrideAccess:true,
    data:{email:a.email,password:a.password,role:a.role}})
}
if(seed.db?.destroy)await Promise.race([
  seed.db.destroy(),new Promise(resolve=>setTimeout(resolve,4000))
])

const next=spawn(process.execPath,[
  './node_modules/next/dist/bin/next','dev','--webpack',
  '--hostname','127.0.0.1','--port','3100',
],{
  cwd:process.cwd(), env:{...process.env, NEXT_TELEMETRY_DISABLED:'1', NODE_ENV:'development'},
  stdio:['ignore','pipe','pipe'],detached:true,
})
next.stdout.on('data',(part:Buffer)=>{nextLog=(nextLog+part.toString()).slice(-12000)})
next.stderr.on('data',(part:Buffer)=>{nextLog=(nextLog+part.toString()).slice(-12000)})

try{
  await waitServer(next)
  console.log('G1_NEXT: Next.js App Router is answering TCP requests on 127.0.0.1:3100')
  await check('Actual Next.js 16 renders English archive homepage',async()=>{
    const r=await fetchRaw('/')
    assert.equal(r.status,200)
    assert.match(r.text,/The Living Knowledge Archive/)
    assert.ok(!r.text.includes('PRIVATE UNSCREENED MATERIAL'))
  })
  await check('Preview app robots policy blocks all search engine indexing',async()=>{
    const r=await fetchRaw('/robots.txt')
    assert.equal(r.status,200)
    assert.match(r.text,/Disallow: \//)
  })
  await check('Next.js sitemap contains no unapproved knowledge',async()=>{
    const r=await fetchRaw('/sitemap.xml')
    assert.equal(r.status,200)
    assert.match(r.text,/<urlset/)
    assert.ok(!r.text.includes('<url><loc>'))
    assert.match(r.headers.get('cache-control')??'',/no-store/)
  })

  const entity=randomUUID(),revision=randomUUID(),source=randomUUID()
  const original='The synthetic research paper introduced a test idea.'
  await check('Unapproved knowledge HTML is 404 rather than draft preview',async()=>{
    const r=await fetchRaw('/knowledge/'+entity+'?draft=true&preview=true')
    assert.equal(r.status,404)
    assert.ok(!r.text.includes(original))
    assert.match(r.headers.get('cache-control')??'',/no-store/)
  })
  await check('Public app does not mount admin or preview bypass routes',async()=>{
    for(const path of ['/admin','/preview?draft=true','/knowledge/'+entity+'/draft']){
      const r=await fetchRaw(path)
      assert.equal(r.status,404,path+': '+r.status)
    }
  })

  const tokens:Record<string,string>={}
  const browserCookies:Record<string,string>={}
  await check('Anonymous studio access redirects to staff login without leaking private content',async()=>{
    const r=await fetchRaw('/studio')
    assert.ok([302,303,307,308].includes(r.status),'Anonymous studio status: '+r.status)
    assert.match(r.headers.get('location')??'',/\/studio\/login/)
    assert.ok(!r.text.includes('COOKIE SESSION PRIVATE DRAFT'))
    assert.match(r.headers.get('cache-control')??'',/no-store/)
  })
  await check('Staff sign-in is available but has no public registration control',async()=>{
    const r=await fetchRaw('/studio/login')
    assert.equal(r.status,200,r.text.slice(0,300))
    assert.match(r.text,/Editorial Sign In/)
    assert.match(r.text,/Public registration is disabled/)
    assert.match(r.headers.get('x-robots-tag')??'',/noindex/)
  })
  await check('Actual Next.js REST route logs in editor, reviewer and publisher',async()=>{
    for(const a of accounts) {
      const r=await fetchRaw('/api/staff/login','POST',
        {email:a.email,password:a.password})
      assert.equal(r.status,200,r.text.slice(0,350))
      assert.ok(typeof r.json?.token==='string' && r.json.token.length>30)
      tokens[a.key]=r.json.token
      const setCookie=r.headers.get('set-cookie') ?? ''
      assert.ok(setCookie.includes('HttpOnly'),'Payload login must set HttpOnly cookie')
      assert.ok(/SameSite=Strict/i.test(setCookie),'Cookie must use SameSite Strict')
      browserCookies[a.key]=setCookie.split(';')[0]
    }
  })
  await check('Anonymous cannot create staff accounts through the Next router',async()=>{
    denied(await fetchRaw('/api/staff','POST',{
      email:'rogue-'+randomUUID().slice(0,8)+'@example.invalid',
      password:'synthetic-forbidden',role:'publisher'}))
  })

  let doc:any
  await check('Editor JWT creates a real Payload draft via deployed Next route',async()=>{
    const r=await fetchRaw('/api/editorial-drafts?draft=true','POST',{
      stableEntityId:entity,title:'Synthetic Next article',
      body:original,_status:'draft'
    },tokens.editor)
    assert.ok([200,201].includes(r.status),r.text.slice(0,450))
    assert.equal(r.json?.doc?._status,'draft')
    doc=r.json.doc
  })
  await check('Anonymous cannot see the Next Payload editorial draft ID',async()=>{
    const r=await fetchRaw('/api/editorial-drafts/'+doc.id+'?draft=true')
    if(r.status===200)assert.ok(!r.text.includes(original))
    else denied(r)
  })
  await check('Other editor is isolated by authenticated document ownership',async()=>{
    const r=await fetchRaw('/api/editorial-drafts/'+doc.id+'?draft=true',
      'GET',undefined,tokens.other)
    if(r.status===200)assert.ok(!r.text.includes(original))
    else denied(r)
  })
  await check('Editor browser cookie unlocks private studio without exposing reviewer-only state',async()=>{
    const r=await fetch(BASE+'/studio',{
      headers:{Cookie:browserCookies.editor},signal:AbortSignal.timeout(12000),
      redirect:'manual',
    })
    const text=await r.text()
    assert.equal(r.status,200,'Editor studio response: '+r.status+' '+text.slice(0,250))
    assert.match(text,/Editorial Workspace/)
    assert.match(text,/New private draft/)
    assert.match(text,/Save private draft/)
    assert.match(r.headers.get('cache-control')??'',/no-store/)
    assert.match(r.headers.get('x-robots-tag')??'',/noindex/)
  })
  await check('Reviewer browser cookie grants read-only workspace without editor composer',async()=>{
    const r=await fetch(BASE+'/studio',{
      headers:{Cookie:browserCookies.reviewer},signal:AbortSignal.timeout(12000),
      redirect:'manual',
    })
    const text=await r.text()
    assert.equal(r.status,200,'Reviewer studio response: '+r.status+' '+text.slice(0,250))
    assert.match(text,/Review queue/)
    assert.ok(!text.includes('Save private draft'),'Reviewer must not receive editor form')
  })
  await check('Publisher browser cookie sees publication desk but not editor composer',async()=>{
    const r=await fetch(BASE+'/studio',{
      headers:{Cookie:browserCookies.publisher},signal:AbortSignal.timeout(12000),
      redirect:'manual',
    })
    const text=await r.text()
    assert.equal(r.status,200,'Publisher studio response: '+r.status+' '+text.slice(0,250))
    assert.match(text,/Publication desk/)
    assert.ok(!text.includes('Save private draft'),'Publisher must not receive editor form')
  })
  await check('Forged or expired browser cookie cannot render private studio',async()=>{
    const r=await fetch(BASE+'/studio',{
      headers:{Cookie:'staff-token=forged; payload-token=forged'},
      signal:AbortSignal.timeout(12000),redirect:'manual',
    })
    assert.ok([302,303,307,308].includes(r.status),'Invalid cookie studio returned '+r.status)
    assert.match(r.headers.get('location')??'',/\/studio\/login/)
  })
  await check('Signed login cookie is accepted for same-origin staff session',async()=>{
    const r=await fetch(BASE+'/api/staff/me',{
      headers:{Cookie:browserCookies.editor,Origin:BASE},
      signal:AbortSignal.timeout(12000),
    })
    assert.equal(r.status,200,'Browser-style cookie session rejected')
    const json:any=await r.json()
    assert.equal(json.user?.role,'editor')
  })
  await check('Same-origin cookie-based editor POST can create a private draft',async()=>{
    const r=await fetch(BASE+'/api/editorial-drafts?draft=true',{
      method:'POST',
      headers:{Cookie:browserCookies.editor,Origin:BASE,'Content-Type':'application/json',
        'Sec-Fetch-Site':'same-origin'},
      body:JSON.stringify({
        stableEntityId:randomUUID(),title:'Cookie session private draft',
        body:'COOKIE SESSION PRIVATE DRAFT',_status:'draft',
      }),
      signal:AbortSignal.timeout(12000),
    })
    const text=await r.text()
    assert.ok([200,201].includes(r.status),'Trusted browser POST failed: '+text.slice(0,350))
    assert.ok(text.includes('draft'))
  })
  await check('Cross-origin cookie POST is denied before reviewer/publisher authorization',async()=>{
    for(const endpoint of ['/api/g1-approve','/api/g1-publish','/api/editorial-drafts']){
      const r=await fetch(BASE+endpoint,{
        method:'POST',headers:{
          Cookie:browserCookies.reviewer,
          Origin:'https://malicious.example.invalid',
          'Content-Type':'application/json',
          'Sec-Fetch-Site':'cross-site',
        },
        body:JSON.stringify({revisionId:randomUUID(),entityId:randomUUID(),expectedVersion:0}),
        signal:AbortSignal.timeout(12000),
      })
      assert.equal(r.status,403,endpoint+' cross-origin returned '+r.status)
      assert.equal((await r.json() as any).error,'CSRF_ORIGIN_REJECTED')
    }
  })
  await check('Originless cookie-based state changes fail closed, even with signed JWT',async()=>{
    const r=await fetch(BASE+'/api/editorial-drafts?draft=true',{
      method:'POST',
      headers:{Cookie:browserCookies.editor,Authorization:'JWT '+tokens.editor,
        'Content-Type':'application/json'},
      body:JSON.stringify({stableEntityId:randomUUID(),title:'Originless',body:'must deny'}),
      signal:AbortSignal.timeout(12000),
    })
    assert.equal(r.status,403)
  })
  await check('Null/forged Origin cannot exploit authenticated editor cookies',async()=>{
    for(const origin of ['null','http://127.0.0.1:3100.attacker.invalid','http://127.0.0.1:3101']){
      const r=await fetch(BASE+'/api/editorial-drafts?draft=true',{
        method:'POST',
        headers:{Cookie:browserCookies.editor,Origin:origin,'Content-Type':'application/json'},
        body:JSON.stringify({stableEntityId:randomUUID(),title:'Forged Origin',body:'must deny'}),
        signal:AbortSignal.timeout(12000),
      })
      assert.equal(r.status,403,'Invalid Origin unexpectedly passed: '+origin)
    }
  })
  await check('Cross-site Fetch Metadata is denied even with an explicit valid JWT',async()=>{
    const r=await fetch(BASE+'/api/editorial-drafts?draft=true',{
      method:'POST',
      headers:{Authorization:'JWT '+tokens.editor,Origin:BASE,
        'Sec-Fetch-Site':'cross-site','Content-Type':'application/json'},
      body:JSON.stringify({stableEntityId:randomUUID(),title:'Fetch-site forgery',body:'must deny'}),
      signal:AbortSignal.timeout(12000),
    })
    assert.equal(r.status,403)
  })
  await check('Forged proxy Host headers cannot override the trusted origin allowlist',async()=>{
    const r=await fetch(BASE+'/api/editorial-drafts?draft=true',{
      method:'POST',
      headers:{Cookie:browserCookies.editor,Origin:'https://malicious.example.invalid',
        'X-Forwarded-Host':'malicious.example.invalid','Content-Type':'application/json'},
      body:JSON.stringify({stableEntityId:randomUUID(),title:'Host spoof',body:'must deny'}),
      signal:AbortSignal.timeout(12000),
    })
    assert.equal(r.status,403)
  })
  await check('Reviewer can inspect the draft through real Next.js REST',async()=>{
    const r=await fetchRaw('/api/editorial-drafts/'+doc.id+'?draft=true',
      'GET',undefined,tokens.reviewer)
    assert.equal(r.status,200,r.text.slice(0,250))
    assert.equal(r.json?.body,original)
  })
  await check('Forced Payload direct publish is rejected through real Next.js',async()=>{
    const r=await fetchRaw('/api/editorial-drafts/'+doc.id,'PATCH',
      {_status:'published'},tokens.editor)
    assert.equal(r.status,403,r.text.slice(0,350))
  })
  await check('Next.js authenticated GraphQL reviewer reads the actual draft',async()=>{
    const r=await fetchRaw('/api/graphql','POST',{
      query:'{ EditorialDrafts { docs { id title body } } }'
    },tokens.reviewer)
    assert.equal(r.status,200,r.text.slice(0,400))
    assert.ok(!r.json?.errors?.length,r.text.slice(0,400))
    assert.ok(r.json.data.EditorialDrafts.docs.some((d:any)=>d.body===original))
  })
  await check('Next.js anonymous GraphQL cannot expose private content',async()=>{
    const r=await fetchRaw('/api/graphql','POST',{
      query:'{ EditorialDrafts { docs { id title body } } }'
    })
    assert.ok(r.status<500,r.text.slice(0,250))
    assert.ok(!r.text.includes(original))
  })
  await check('Next.js rejects remote-origin CORS access to private REST',async()=>{
    const r=await fetch(BASE+'/api/editorial-drafts',{
      method:'OPTIONS',headers:{
        Origin:'https://malicious.example.invalid',
        'Access-Control-Request-Method':'GET',
        'Access-Control-Request-Headers':'Authorization'
      },redirect:'manual',signal:AbortSignal.timeout(12000)
    })
    assert.notEqual(r.headers.get('access-control-allow-origin'),'*')
    assert.notEqual(r.headers.get('access-control-allow-origin'),'https://malicious.example.invalid')
  })

  // Synthetic KG fixture data are inserted by an isolated test owner.
  // Editorial approval and release below must occur through the real Next HTTP JWT path.
  await admin.query('INSERT INTO kg.entities(id,kind,name) VALUES($1,$2,$3)',
    [entity,'concept','Next SSR synthetic knowledge'])
  await admin.query('INSERT INTO kg.sources(id,locator,description) VALUES($1,$2,$3)',
    [source,'urn:synthetic:next:'+source,'Not real-world evidence'])
  await admin.query('INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES($1,$2,$3,$4)',
    [revision,entity,'en',original])
  await admin.query('INSERT INTO kg.claims(revision_id,claim_key,anchor,statement) VALUES($1,$2,$3,$4)',
    [revision,'claim-1','p-1','paper introduced a test idea'])
  await admin.query(
    'INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) VALUES($1,$2,$3,$4,$5,$6)',
    [revision,'claim-1',source,'supports','synthetic-fixture','CI-test-only'])
  const approval={draftId:doc.id,revisionId:revision}
  const publication={entityId:entity,revisionId:revision,expectedVersion:0}
  await check('Publisher cannot release unapproved draft in full Next.js runtime',async()=>{
    const r=await fetchRaw('/api/g1-publish','POST',publication,tokens.publisher)
    assert.equal(r.status,409,r.text.slice(0,350))
    assert.equal((await admin.query('SELECT count(*)::int n FROM kg.public_entries')).rows[0].n,0)
  })
  await check('Forged editor role cannot approve over Next.js HTTP',async()=>{
    denied(await fetchRaw('/api/g1-approve','POST',
      {...approval,role:'reviewer'},tokens.editor))
  })
  await check('Reviewer service DB role cannot read the HMAC attestation key',async()=>{
    await assert.rejects(
      reviewerProbe.query('SELECT secret_key FROM kg.attestation_private_key'),
      /permission denied/i)
  })
  await check('Reviewer DB role cannot bypass individual signature through old approval function',async()=>{
    await assert.rejects(
      reviewerProbe.query('SELECT kg.approve_revision($1::uuid)',[revision]),
      /permission denied/i)
  })
  await check('Forged reviewer attestation signature is rejected by PostgreSQL',async()=>{
    await assert.rejects(
      reviewerProbe.query(
        'SELECT kg.approve_revision_attested($1::uuid,$2::bigint,$3::text,$4::text)',
        [revision,seededAccounts.reviewer.id,'0'.repeat(32),'0'.repeat(64)]),
      /REVIEW_ATTESTATION_SIGNATURE_INVALID/)
    assert.equal((await admin.query(
      'SELECT count(*)::int n FROM kg.approvals WHERE revision_id=$1',[revision])).rows[0].n,0)
  })
  await check('Reviewer service cannot attribute approval to an editor identity',async()=>{
    await assert.rejects(
      reviewerProbe.query(
        'SELECT kg.approve_revision_attested($1::uuid,$2::bigint,$3::text,$4::text)',
        [revision,seededAccounts.editor.id,'1'.repeat(32),'0'.repeat(64)]),
      /NOT_A_VALID_REVIEWER_STAFF_ACCOUNT/)
  })
  await check('Actual reviewer JWT approves an exact revision through the restricted DB role',async()=>{
    const r=await fetchRaw('/api/g1-approve','POST',approval,tokens.reviewer)
    assert.equal(r.status,200,r.text.slice(0,450))
    assert.equal(r.json?.approved,true)
    const a=(await admin.query('SELECT reviewer_login FROM kg.approval_audit WHERE revision_id=$1',
      [revision])).rows[0]
    assert.equal(a.reviewer_login,'kg_g1_reviewer_probe')
  })
  await check('Immutable human audit binds signed JWT staff ID and exact revision checksum',async()=>{
    const record=(await admin.query(
      'SELECT reviewer_staff_id,revision_checksum,nonce,signature FROM kg.human_review_attestations WHERE revision_id=$1',
      [revision])).rows[0]
    assert.ok(record)
    assert.equal(Number(record.reviewer_staff_id),Number(seededAccounts.reviewer.id))
    const row=(await admin.query('SELECT checksum FROM kg.revisions WHERE id=$1',[revision])).rows[0]
    assert.equal(record.revision_checksum,row.checksum)
    const signed=[revision,String(seededAccounts.reviewer.id),row.checksum,record.nonce].join('|')
    const secret=process.env.G1_REVIEW_ATTESTATION_SECRET ?? ''
    const expected=createHmac('sha256',Buffer.from(secret,'hex')).update(signed,'utf8').digest('hex')
    assert.equal(record.signature,expected)
  })
  await check('Approved audit row is immutable even to the test database owner',async()=>{
    await assert.rejects(admin.query(
      'UPDATE kg.human_review_attestations SET reviewer_staff_id=$1 WHERE revision_id=$2',
      [seededAccounts.editor.id,revision]),/IMMUTABLE_REVISION_OR_SNAPSHOT/)
  })
  await check('Replaying same authenticated reviewer approval cannot rewrite human identity',async()=>{
    const r=await fetchRaw('/api/g1-approve','POST',approval,tokens.reviewer)
    assert.equal(r.status,409,r.text.slice(0,250))
    const a=(await admin.query(
      'SELECT reviewer_staff_id FROM kg.human_review_attestations WHERE revision_id=$1',
      [revision])).rows[0]
    assert.equal(Number(a.reviewer_staff_id),Number(seededAccounts.reviewer.id))
  })
  await check('Actual publisher JWT publishes only previously approved revision',async()=>{
    const r=await fetchRaw('/api/g1-publish','POST',publication,tokens.publisher)
    assert.equal(r.status,200,r.text.slice(0,450))
    assert.equal(Number(r.json?.version),1)
  })
  await check('Next.js HTML SSR exposes exactly the approved immutable body',async()=>{
    const r=await fetchRaw('/knowledge/'+entity)
    assert.equal(r.status,200,r.text.slice(0,650))
    assert.ok(r.text.includes(original))
    assert.ok(r.text.includes('VERIFIED KNOWLEDGE'))
    assert.match(r.headers.get('cache-control')??'',/no-store/)
  })
  await check('Next.js sitemap includes only approved knowledge after publish',async()=>{
    const r=await fetchRaw('/sitemap.xml?draft=true')
    assert.equal(r.status,200)
    assert.ok(r.text.includes(entity))
    assert.ok(!r.text.includes('PRIVATE UNSCREENED MATERIAL'))
  })
  await check('Private draft edits never change an approved SSR page',async()=>{
    const r=await fetchRaw('/api/editorial-drafts/'+doc.id+'?draft=true',
      'PATCH',{body:'PRIVATE UNSCREENED MATERIAL'},tokens.editor)
    assert.equal(r.status,200,r.text.slice(0,450))
    const page=await fetchRaw('/knowledge/'+entity+'?draft=true')
    assert.equal(page.status,200)
    assert.ok(page.text.includes(original))
    assert.ok(!page.text.includes('PRIVATE UNSCREENED MATERIAL'))
    const xml=await fetchRaw('/sitemap.xml')
    assert.ok(!xml.text.includes('PRIVATE UNSCREENED MATERIAL'))
  })
  await check('Publisher cannot replay stale version through real HTTP server',async()=>{
    const r=await fetchRaw('/api/g1-publish','POST',publication,tokens.publisher)
    assert.equal(r.status,409)
  })
  await check('Next.js API security headers disable indexing and caching',async()=>{
    const r=await fetchRaw('/api/staff/me','GET',undefined,tokens.editor)
    assert.equal(r.status,200)
    assert.match(r.headers.get('x-robots-tag')??'',/noindex/)
    assert.match(r.headers.get('cache-control')??'',/no-store/)
    assert.equal(r.headers.get('x-frame-options'),'DENY')
  })
  console.log('G1_FULL_NEXT_APP_'+passed+'_CHECKS_SUCCESS')
}catch(err){
  console.error('G1_NEXT_FAILURE_CONTEXT',nextLog.slice(-5500))
  throw err
}finally{
  await admin.end()
  await reviewerProbe.end()
  try{process.kill(-next.pid!,'SIGTERM')}catch{next.kill('SIGTERM')}
  await new Promise<void>(resolve=>{
    const timer=setTimeout(()=>{try{process.kill(-next.pid!,'SIGKILL')}catch{};resolve()},4000)
    next.once('exit',()=>{clearTimeout(timer);resolve()})
  })
  clearTimeout(watchdog)
}
process.exit(0)
