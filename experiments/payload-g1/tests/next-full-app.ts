import assert from 'node:assert/strict'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Pool } from 'pg'
import { getPayload } from 'payload'
import config from '../native-auth.config.ts'
import { packageHash } from '../lib/multi-source-review'

const BASE = 'http://127.0.0.1:3100'
const admin = new Pool({ connectionString: process.env.DATABASE_URL })
const reviewerProbe = new Pool({ connectionString: process.env.G1_REVIEWER_DATABASE_URL })
const candidateProbe = new Pool({ connectionString: process.env.G1_CANDIDATE_DATABASE_URL })
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
    assert.match(text,/Independent evidence review/)
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
  // Issue #17 milestone 1: editor-supplied citation becomes a PENDING,
  // immutable KG candidate. It is NEVER considered independently verified.
  await check('Private long draft preserves multiple sources and cannot use the single-source approval path',async()=>{
    const longBody='SYNTHETIC PRIVATE LONG DRAFT. '.repeat(600)+'A synthetic claim.'
    const supplementalEvidence={sources:[
      {id:'s1',url:'https://example.invalid/source-one',description:'Source one'},
      {id:'s2',url:'https://example.invalid/source-two',description:'Source two'}],
      claims:[{id:'c1',statement:'A synthetic claim.',anchor:'body',sourceIds:['s1','s2']}],
      media:[{id:'m1',objectKey:'review/example.webp',sha256:'a'.repeat(64),alt:'Synthetic image',credit:'Test author',rightsStatus:'pending' as const}]}
    const created=await fetchRaw('/api/editorial-drafts?draft=true','POST',{
      stableEntityId:randomUUID(),title:'Synthetic multi-source draft',
      body:longBody,supplementalEvidence,_status:'draft',
    },tokens.editor)
    assert.ok([200,201].includes(created.status),created.text.slice(0,400))
    const id=created.json.doc.id
    const saved=await fetchRaw('/api/editorial-drafts/'+id+'?draft=true','GET',undefined,tokens.editor)
    assert.equal(saved.status,200)
    assert.equal(saved.json.body,longBody)
    assert.equal(saved.json.supplementalEvidence.sources.length,2)
    const guest=await fetchRaw('/api/editorial-drafts/'+id+'?draft=true')
    denied(guest)
    const candidate=await fetchRaw('/api/g1-candidate','POST',{
      draftId:id,sourceUrl:'https://example.invalid/source-one',
      sourceDescription:'Synthetic source description for a private draft',
      claim:'A synthetic claim.',anchor:'body',pinpoint:'section 1',licenseDeclaration:'unknown',
    },tokens.editor)
    assert.equal(candidate.status,409,candidate.text.slice(0,400))
    const bypass=await fetchRaw('/api/g1-approve','POST',{draftId:id,revisionId:randomUUID()},tokens.reviewer)
    assert.equal(bypass.status,409,bypass.text.slice(0,400))
    const snapshotHash=packageHash({title:'Synthetic multi-source draft',body:longBody,...supplementalEvidence})
    const review={draftId:id,snapshotHash,evidence:[
      {claimId:'c1',sourceId:'s1',verdict:'verified',note:'Reviewed source one'},
      {claimId:'c1',sourceId:'s2',verdict:'verified',note:'Reviewed source two'}],
      media:[{mediaId:'m1',verdict:'cleared',note:'Reviewed image rights'}]}
    for(const jwt of [undefined,tokens.editor,tokens.publisher]){
      const blocked=await fetchRaw('/api/multi-source-reviews','POST',review,jwt)
      denied(blocked)
    }
    const missing=await fetchRaw('/api/multi-source-reviews','POST',{...review,evidence:review.evidence.slice(0,1)},tokens.reviewer)
    assert.equal(missing.status,400,missing.text.slice(0,400))
    const reviewed=await fetchRaw('/api/multi-source-reviews','POST',{...review,reviewerId:'forged'},tokens.reviewer)
    assert.ok([200,201].includes(reviewed.status),reviewed.text.slice(0,500))
    assert.equal(String(reviewed.json.doc.reviewerId),String(seededAccounts.reviewer.id))
    assert.equal(reviewed.json.doc.snapshot.body,longBody)
    const reviewId=reviewed.json.doc.id
    const update=await fetchRaw('/api/multi-source-reviews/'+reviewId,'PATCH',{snapshotHash:'f'.repeat(64)},tokens.reviewer)
    denied(update)
    const edited=await fetchRaw('/api/editorial-drafts/'+id+'?draft=true','PATCH',{body:longBody+' changed'},tokens.editor)
    assert.equal(edited.status,200)
    const stale=await fetchRaw('/api/multi-source-reviews','POST',review,tokens.reviewer)
    assert.equal(stale.status,400,stale.text.slice(0,400))
    const originalReview=await fetchRaw('/api/multi-source-reviews/'+reviewId,'GET',undefined,tokens.reviewer)
    assert.equal(originalReview.json.snapshot.body,longBody)
    assert.equal((await fetchRaw('/sitemap.xml')).text.includes('SYNTHETIC PRIVATE LONG DRAFT'),false)
  })
  const candidateEntity=randomUUID()
  const candidateBody='The synthetic test note says the fixture idea was introduced in the lab.'
  const candidateClaim='the fixture idea was introduced in the lab'
  let candidateDraft:any
  await check('Editor submits the source-bound source candidate starting from a private Payload draft',async()=>{
    const draft=await fetchRaw('/api/editorial-drafts?draft=true','POST',{
      stableEntityId:candidateEntity,title:'Unverified candidate fixture',
      body:candidateBody,_status:'draft',
    },tokens.editor)
    assert.ok([200,201].includes(draft.status),draft.text.slice(0,350))
    candidateDraft=draft.json.doc
    assert.ok(candidateDraft?.id)
  })
  const evidenceData={
    draftId:0,sourceUrl:'https://example.invalid/synthetic-fixture',
    sourceDescription:'Synthetic CI fixture, not an independently checked source.',
    claim:candidateClaim,anchor:'paragraph-1',pinpoint:'fixture section 2',
    licenseDeclaration:'unknown',
  }
  evidenceData.draftId=candidateDraft.id
  await check('Anonymous, reviewer and publisher cannot create editorial candidates',async()=>{
    for(const jwt of [undefined,tokens.reviewer,tokens.publisher]){
      const res=await fetchRaw('/api/g1-candidate','POST',evidenceData,jwt)
      assert.equal(res.status,403,res.text.slice(0,300))
    }
  })
  await check('Second editor cannot submit a candidate for another editor draft',async()=>{
    const res=await fetchRaw('/api/g1-candidate','POST',evidenceData,tokens.other)
    denied(res)
    assert.ok(!res.text.includes(candidateBody),'Private draft body disclosed')
  })
  await check('Candidate endpoint rejects missing source, HTTP-only URL and unsupported claim',async()=>{
    const bad=[
      {...evidenceData,sourceUrl:'http://example.invalid/not-secure'},
      {...evidenceData,sourceUrl:''},
      {...evidenceData,claim:'This is not found anywhere in the draft.'},
    ]
    for(const payload of bad){
      const result=await fetchRaw('/api/g1-candidate','POST',payload,tokens.editor)
      assert.equal(result.status,400,result.text.slice(0,300))
    }
  })
  await check('Dedicated candidate DB login cannot read draft KG revisions or signing key',async()=>{
    await assert.rejects(candidateProbe.query('SELECT id FROM kg.revisions LIMIT 1'),/permission denied/i)
    await assert.rejects(candidateProbe.query('SELECT secret_key FROM kg.candidate_private_key'),/permission denied/i)
  })
  await check('Candidate DB login cannot directly approve or publish a revision',async()=>{
    await assert.rejects(candidateProbe.query(
      'SELECT kg.approve_revision_attested($1,$2,$3,$4)',
      [randomUUID(),Number(seededAccounts.reviewer.id),'0'.repeat(32),'0'.repeat(64)]
    ),/permission denied/i)
    await assert.rejects(candidateProbe.query(
      'SELECT kg.publish($1,$2,$3)',[candidateEntity,randomUUID(),0]
    ),/permission denied/i)
  })
  await check('Forged attestation cannot create a KG entity or candidate',async()=>{
    const forgedRevision=randomUUID(),forgedEntity=randomUUID()
    await assert.rejects(candidateProbe.query(
      'SELECT kg.g1_submit_candidate('+
      '$1::bigint,$2::bigint,$3::uuid,$4::uuid,'+
      '$5::text,$6::text,$7::text,$8::text,$9::text,'+
      '$10::text,$11::text,$12::text,$13::text,$14::text)',
      [Number(seededAccounts.editor.id),candidateDraft.id,
        forgedEntity,forgedRevision,'Unverified candidate fixture',
        candidateBody,evidenceData.sourceUrl,evidenceData.sourceDescription,
        candidateClaim,evidenceData.anchor,evidenceData.pinpoint,
        'unknown','0'.repeat(32),'0'.repeat(64)],
    ),/CANDIDATE_SIGNATURE_INVALID/)
    assert.equal((await admin.query('SELECT count(*)::int n FROM kg.entities WHERE id=$1',
      [forgedEntity])).rows[0].n,0)
  })
  let queuedRevision:string=''
  await check('Real editor JWT queues signed KG revision, claim, source and rights declaration atomically',async()=>{
    const response=await fetchRaw('/api/g1-candidate','POST',evidenceData,tokens.editor)
    assert.equal(response.status,201,response.text.slice(0,450))
    assert.equal(response.json?.queued,true)
    assert.equal(response.json?.status,'needs-review')
    queuedRevision=response.json.revisionId
    const state=await admin.query(
      'SELECT c.submitted_by,c.draft_id,c.license_declaration,c.source_review_status,'+
      'c.rights_review_status,r.body,r.checksum,s.locator,cl.statement,ev.pinpoint '+
      'FROM kg.g1_candidates c JOIN kg.revisions r ON c.revision_id=r.id '+
      'JOIN kg.sources s ON s.id=c.source_id '+
      'JOIN kg.claims cl ON cl.revision_id=c.revision_id '+
      'JOIN kg.claim_evidence ev ON ev.revision_id=c.revision_id '+
      'WHERE c.revision_id=$1',[queuedRevision])
    assert.equal(state.rows.length,1)
    const r=state.rows[0]
    assert.equal(Number(r.submitted_by),Number(seededAccounts.editor.id))
    assert.equal(Number(r.draft_id),Number(candidateDraft.id))
    assert.equal(r.license_declaration,'unknown')
    assert.equal(r.source_review_status,'pending')
    assert.equal(r.rights_review_status,'pending')
    assert.equal(r.body,candidateBody)
    assert.equal(r.locator,evidenceData.sourceUrl)
    assert.equal(r.statement,candidateClaim)
    assert.equal(r.pinpoint,evidenceData.pinpoint)
    assert.match(r.checksum,/^[0-9a-f]{64}$/)
  })
  await check('A pending source candidate has no public head or sitemap record',async()=>{
    const knowledge=await fetchRaw('/knowledge/'+candidateEntity+'?draft=true')
    assert.equal(knowledge.status,404)
    const sitemap=await fetchRaw('/sitemap.xml')
    assert.ok(!sitemap.text.includes(candidateEntity))
    const counters=await admin.query(
      'SELECT (SELECT count(*) FROM kg.approvals WHERE revision_id=$1)::int approvals,'+
      '(SELECT count(*) FROM kg.heads WHERE entity_id=$2)::int heads,'+
      '(SELECT count(*) FROM kg.outbox WHERE entity_id=$2)::int events',
      [queuedRevision,candidateEntity])
    assert.deepEqual(counters.rows[0],{approvals:0,heads:0,events:0})
  })
  await check('Independent reviewer HTTP approval cannot bypass pending source and rights checks',async()=>{
    const response=await fetchRaw('/api/g1-approve','POST',{
      draftId:candidateDraft.id,revisionId:queuedRevision
    },tokens.reviewer)
    assert.equal(response.status,409,response.text.slice(0,350))
  })
  await check('Even privileged direct SQL cannot approve a pending rights candidate',async()=>{
    await assert.rejects(admin.query(
      'INSERT INTO kg.approvals(revision_id,reviewer) VALUES($1,$2)',
      [queuedRevision,'fixture-forger'],
    ),/CANDIDATE_REVIEW_AND_RIGHTS_NOT_COMPLETE/)
  })
  await check('Publisher cannot expose source candidate with guessed IDs',async()=>{
    const response=await fetchRaw('/api/g1-publish','POST',{
      entityId:candidateEntity,revisionId:queuedRevision,expectedVersion:0,
    },tokens.publisher)
    assert.equal(response.status,409)
    assert.equal((await admin.query('SELECT count(*)::int n FROM kg.heads WHERE entity_id=$1',
      [candidateEntity])).rows[0].n,0)
  })
  await check('Duplicate candidate submission is rejected without partial KG writes',async()=>{
    const before=(await admin.query('SELECT count(*)::int n FROM kg.revisions WHERE entity_id=$1',
      [candidateEntity])).rows[0].n
    const retry=await fetchRaw('/api/g1-candidate','POST',evidenceData,tokens.editor)
    assert.equal(retry.status,409,retry.text.slice(0,300))
    const after=(await admin.query('SELECT count(*)::int n FROM kg.revisions WHERE entity_id=$1',
      [candidateEntity])).rows[0].n
    assert.equal(before,after)
    assert.equal(after,1)
  })
  // G1 reviewer decisions never take the editor's source claims as proof.
  // A reviewer must separately attest source support and reuse rights.
  await check('Only authenticated reviewer can open private candidate evidence queue',async()=>{
    const guest=await fetchRaw('/api/g1-review-queue')
    assert.equal(guest.status,403)
    for(const token of [tokens.editor,tokens.publisher]){
      const blocked=await fetchRaw('/api/g1-review-queue','GET',undefined,token)
      assert.equal(blocked.status,403)
    }
    const queue=await fetchRaw('/api/g1-review-queue','GET',undefined,tokens.reviewer)
    assert.equal(queue.status,200,queue.text.slice(0,300))
    const candidate=queue.json.records.find((r:any)=>r.revisionId===queuedRevision)
    assert.ok(candidate)
    assert.equal(candidate.status,'needs-review')
    assert.equal(candidate.sourceVerdict,'pending')
    assert.equal(candidate.rightsVerdict,'pending')
    assert.equal(candidate.locator,evidenceData.sourceUrl)
    assert.equal(candidate.claim,candidateClaim)
  })
  const unknownReview={
    revisionId:queuedRevision,decision:'accepted',sourceVerdict:'verified',
    rightsVerdict:'cleared',note:'Independent review of synthetic test evidence and reuse rights is claimed only for CI.',
  }
  await check('Editor, publisher and anonymous callers cannot record reviewer decisions',async()=>{
    for(const jwt of [undefined,tokens.editor,tokens.publisher]){
      const result=await fetchRaw('/api/g1-review-decision','POST',unknownReview,jwt)
      assert.equal(result.status,403,result.text.slice(0,200))
    }
  })
  await check('Accept decision fails when source is not verified or rights are not cleared',async()=>{
    for(const malformed of [
      {...unknownReview,sourceVerdict:'unverified'},
      {...unknownReview,rightsVerdict:'not-cleared'},
      {...unknownReview,note:'short'},
    ]){
      const result=await fetchRaw('/api/g1-review-decision','POST',malformed,tokens.reviewer)
      assert.equal(result.status,400,result.text.slice(0,250))
    }
  })
  await check('Reviewer cannot clear unknown editor license by simply checking verified rights',async()=>{
    const result=await fetchRaw('/api/g1-review-decision','POST',unknownReview,tokens.reviewer)
    assert.equal(result.status,409,result.text.slice(0,250))
    const num=(await admin.query('SELECT count(*)::int n FROM kg.g1_review_decisions WHERE revision_id=$1',
      [queuedRevision])).rows[0].n
    assert.equal(num,0)
  })
  await check('Reviewer DB cannot forge signed rejection with guessed nonce and signature',async()=>{
    await assert.rejects(reviewerProbe.query(
      'SELECT kg.g1_record_review_decision($1::uuid,$2::bigint,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text)',
      [queuedRevision,Number(seededAccounts.reviewer.id),
        'rejected','disputed','not-cleared',
        'The synthetic source is not checked and evidence remains unverified.',
        '0'.repeat(32),'0'.repeat(64)],
    ),/REVIEW_DECISION_SIGNATURE_INVALID/)
  })
  const rejection={
    revisionId:queuedRevision,decision:'rejected',
    sourceVerdict:'disputed',rightsVerdict:'not-cleared',
    note:'This CI fixture does not independently establish source authenticity or content rights.',
  }
  await check('Actual reviewer JWT records signed and immutable source/rights rejection',async()=>{
    const result=await fetchRaw('/api/g1-review-decision','POST',rejection,tokens.reviewer)
    assert.equal(result.status,200,result.text.slice(0,350))
    assert.equal(result.json.status,'rejected')
    const d=(await admin.query(
      'SELECT reviewer_staff_id,decision,source_verdict,rights_verdict,revision_checksum,signature '+
      'FROM kg.g1_review_decisions WHERE revision_id=$1',[queuedRevision])).rows[0]
    assert.equal(Number(d.reviewer_staff_id),Number(seededAccounts.reviewer.id))
    assert.equal(d.decision,'rejected')
    assert.equal(d.source_verdict,'disputed')
    assert.equal(d.rights_verdict,'not-cleared')
    assert.match(d.signature,/^[a-f0-9]{64}$/)
    const checksum=(await admin.query('SELECT checksum FROM kg.revisions WHERE id=$1',
      [queuedRevision])).rows[0].checksum
    assert.equal(d.revision_checksum,checksum)
  })
  await check('Rejected decision is append-only and cannot be replayed or changed',async()=>{
    await assert.rejects(admin.query(
      'UPDATE kg.g1_review_decisions SET decision=$1 WHERE revision_id=$2',
      ['accepted',queuedRevision]),/IMMUTABLE_REVISION_OR_SNAPSHOT/)
    const replay=await fetchRaw('/api/g1-review-decision','POST',rejection,tokens.reviewer)
    assert.equal(replay.status,409)
  })
  await check('Editor-asserted claim evidence cannot be rewritten after candidate submission',async()=>{
    await assert.rejects(admin.query(
      'UPDATE kg.claim_evidence SET stance=$1 WHERE revision_id=$2',
      ['uncertain',queuedRevision]),/CANDIDATE_CLAIM_EVIDENCE_IMMUTABLE/)
  })
  await check('Rejected candidate cannot be approved or released, even with a reviewer JWT',async()=>{
    const approval=await fetchRaw('/api/g1-approve','POST',{
      draftId:candidateDraft.id,revisionId:queuedRevision
    },tokens.reviewer)
    assert.equal(approval.status,409)
    const publish=await fetchRaw('/api/g1-publish','POST',{
      entityId:candidateEntity,revisionId:queuedRevision,expectedVersion:0
    },tokens.publisher)
    assert.equal(publish.status,409)
    assert.equal((await fetchRaw('/knowledge/'+candidateEntity)).status,404)
  })

  const acceptedEntity=randomUUID()
  const acceptedBody='Synthetic knowledge article: a laboratory proposal documented a simulated procedure.'
  const acceptedClaim='a laboratory proposal documented a simulated procedure'
  const newDraft=await fetchRaw('/api/editorial-drafts?draft=true','POST',{
    stableEntityId:acceptedEntity,title:'Simulated rights-reviewed fixture',
    body:acceptedBody,_status:'draft'
  },tokens.editor)
  assert.ok([200,201].includes(newDraft.status),newDraft.text.slice(0,250))
  const acceptedDraftId=newDraft.json.doc.id
  const eligibleEvidence={
    draftId:acceptedDraftId,
    sourceUrl:'https://example.org/synthetic-ci-only-review',
    sourceDescription:'Synthetic reviewer decision fixture, no factual evidence outside the isolated test.',
    claim:acceptedClaim,anchor:'paragraph-1',pinpoint:'CI fixture paragraph 1',
    licenseDeclaration:'public-domain'
  }
  let acceptedRevision=''
  await check('An editor-declared eligible license still remains unapproved before independent review',async()=>{
    const queued=await fetchRaw('/api/g1-candidate','POST',eligibleEvidence,tokens.editor)
    assert.equal(queued.status,201,queued.text.slice(0,250))
    acceptedRevision=queued.json.revisionId
    const premature=await fetchRaw('/api/g1-approve','POST',{
      draftId:acceptedDraftId,revisionId:acceptedRevision
    },tokens.reviewer)
    assert.equal(premature.status,409)
    assert.equal((await fetchRaw('/knowledge/'+acceptedEntity)).status,404)
  })
  await check('Reviewer requires a deliberate signed source-verdict and rights-verdict to accept',async()=>{
    const result=await fetchRaw('/api/g1-review-decision','POST',{
      revisionId:acceptedRevision,decision:'accepted',
      sourceVerdict:'verified',rightsVerdict:'cleared',
      note:'Synthetic-only reviewer attests a hypothetical source and license for this disposable CI case.'
    },tokens.reviewer)
    assert.equal(result.status,200,result.text.slice(0,350))
    assert.equal(result.json.status,'ready-for-separate-approval')
    const row=(await admin.query('SELECT reviewer_staff_id,decision,rights_verdict FROM kg.g1_review_decisions WHERE revision_id=$1',
      [acceptedRevision])).rows[0]
    assert.equal(row.decision,'accepted')
    assert.equal(row.rights_verdict,'cleared')
    assert.equal(Number(row.reviewer_staff_id),Number(seededAccounts.reviewer.id))
  })
  await check('Accepted decision alone cannot publish without distinct approval and publisher identity',async()=>{
    const premature=await fetchRaw('/api/g1-publish','POST',{
      entityId:acceptedEntity,revisionId:acceptedRevision,expectedVersion:0
    },tokens.publisher)
    assert.equal(premature.status,409)
    assert.equal((await fetchRaw('/knowledge/'+acceptedEntity)).status,404)
  })
  await check('Separate reviewer approval and publisher action release the exact accepted revision',async()=>{
    const approval=await fetchRaw('/api/g1-approve','POST',{
      draftId:acceptedDraftId,revisionId:acceptedRevision
    },tokens.reviewer)
    assert.equal(approval.status,200,approval.text.slice(0,300))
    const publisher=await fetchRaw('/api/g1-publish','POST',{
      entityId:acceptedEntity,revisionId:acceptedRevision,expectedVersion:0
    },tokens.publisher)
    assert.equal(publisher.status,200,publisher.text.slice(0,300))
    assert.equal(publisher.json.version,1)
    const publicPage=await fetchRaw('/knowledge/'+acceptedEntity)
    assert.equal(publicPage.status,200)
    assert.ok(publicPage.text.includes(acceptedBody))
    const sitemap=await fetchRaw('/sitemap.xml')
    assert.ok(sitemap.text.includes(acceptedEntity))
    assert.ok(!sitemap.text.includes(candidateEntity))
  })
  console.log('G1_FULL_NEXT_APP_'+passed+'_CHECKS_SUCCESS')
}catch(err){
  console.error('G1_NEXT_FAILURE_CONTEXT',nextLog.slice(-5500))
  throw err
}finally{
  await admin.end()
  await reviewerProbe.end()
  await candidateProbe.end()
  try{process.kill(-next.pid!,'SIGTERM')}catch{next.kill('SIGTERM')}
  await new Promise<void>(resolve=>{
    const timer=setTimeout(()=>{try{process.kill(-next.pid!,'SIGKILL')}catch{};resolve()},4000)
    next.once('exit',()=>{clearTimeout(timer);resolve()})
  })
  clearTimeout(watchdog)
}
process.exit(0)
