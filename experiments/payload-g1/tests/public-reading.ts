import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {readApproved,searchApproved,safeSourceUrl,listApprovedDomain} from '../lib/public-reading'
const admin=new Pool({connectionString:process.env.DATABASE_URL})
const reader=new Pool({connectionString:process.env.PUBLIC_DATABASE_URL})
const tag='reading-'+randomUUID()
let count=0,log=''
const check=async(label:string,fn:()=>Promise<void>)=>{await fn();console.log('PASS / '+label);count++}
const ids:string[]=[]
let privateId='',firstRevision='',firstSource=''
async function seed(body:string,published=true){
 const id=randomUUID(),revision=randomUUID(),source=randomUUID()
 await admin.query('INSERT INTO kg.entities(id,kind,name) VALUES($1,$2,$3)',[id,'concept','PRIVATE EDITOR TITLE NOT FOR PUBLIC DISPLAY'])
 await admin.query('INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES($1,$2,$3,$4)',[revision,id,'en',body])
 await admin.query('INSERT INTO kg.revision_reader_metadata(revision_id,title,summary,primary_domain) VALUES($1,$2,$3,$4)',[revision,'Synthetic published title','Synthetic summary','history'])
 await admin.query('INSERT INTO kg.claims(revision_id,claim_key,anchor,statement) VALUES($1,$2,$3,$4)',[revision,'claim-1','paragraph-1',body])
 await admin.query('INSERT INTO kg.sources(id,locator,description) VALUES($1,$2,$3)',[source,'https://example.invalid/'+source,'Synthetic supporting reference'])
 await admin.query('INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) VALUES($1,$2,$3,$4,$5,$6)',[revision,'claim-1',source,'supports','Fixture paragraph 1','PRIVATE REVIEWER IDENTITY'])
 if(published){
  await admin.query('INSERT INTO kg.approvals(revision_id,reviewer) VALUES($1,$2)',[revision,'synthetic-ci-owner'])
  await admin.query('SELECT kg.publish($1,$2,0)',[id,revision])
  await admin.query('SELECT kg.project_event(id) FROM kg.outbox WHERE entity_id=$1',[id])
 }
 return {id,revision,source}
}
let server:ReturnType<typeof spawn>|undefined
const mode=process.env.READING_TEST_MODE==='production'?'start':'dev'
const base='http://127.0.0.1:3120'
const timeout=setTimeout(()=>{console.error('PUBLIC_READING_TIMEOUT');process.exit(124)},230000)
async function request(path:string){
 const r=await fetch(base+path,{signal:AbortSignal.timeout(25000)})
 return {status:r.status,body:await r.text(),headers:r.headers}
}
try{
 for(let i=0;i<25;i++){
  const row=await seed('SYNTHETIC TEST ONLY '+tag+' published fixture '+i)
  ids.push(row.id)
  if(i===0){firstRevision=row.revision;firstSource=row.source}
 }
 privateId=(await seed('SYNTHETIC PRIVATE '+tag+' SECRET_UNPUBLISHED_EVIDENCE',false)).id
 const unsafeSource=randomUUID(),dispute=randomUUID()
 // Additional evidence is inserted on a fresh revision before approval.
 const conflictId=randomUUID(),conflictRevision=randomUUID()
 await admin.query('INSERT INTO kg.entities VALUES($1,$2,$3)',[conflictId,'concept','Synthetic disagreement'])
 await admin.query('INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES($1,$2,$3,$4)',[conflictRevision,conflictId,'en','Synthetic source disagreement case'])
 await admin.query('INSERT INTO kg.claims VALUES($1,$2,$3,$4)',[conflictRevision,'claim-conflict','section-1','Synthetic source disagreement case'])
 for(const [source,url,description,stance] of [
  [unsafeSource,'javascript:alert('+JSON.stringify(unsafeSource)+')','<img src=x onerror=alert(1)>','supports'],
  [dispute,'https://example.invalid/'+dispute,'Synthetic dissenting reference','contradicts']
 ]){
  await admin.query('INSERT INTO kg.sources(id,locator,description) VALUES($1,$2,$3)',[source,url,description])
  await admin.query('INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) VALUES($1,$2,$3,$4,$5,$6)',[conflictRevision,'claim-conflict',source,stance,'Fixture section 1','PRIVATE REVIEWER IDENTITY'])
 }
 await admin.query('INSERT INTO kg.approvals VALUES($1,$2)',[conflictRevision,'synthetic-ci-owner'])
 await admin.query('SELECT kg.publish($1,$2,0)',[conflictId,conflictRevision])
 await admin.query('SELECT kg.project_event(id) FROM kg.outbox WHERE entity_id=$1',[conflictId])
 await check('Search reaches approved records beyond the six homepage entries, with stable pagination',async()=>{
  const a=await searchApproved(reader,tag)
  assert.equal(a.results.length,20);assert.equal(a.hasMore,true);assert.ok(a.nextCursor)
  const b=await searchApproved(reader,tag,a.nextCursor!)
  assert.equal(b.results.length,5);assert.equal(b.hasMore,false)
  assert.equal(new Set([...a.results,...b.results].map(x=>x.entity_id)).size,25)
  assert.ok(![...a.results,...b.results].some(x=>x.entity_id===privateId))
 })
 await check('Literal wildcard and SQL-looking search text cannot widen results',async()=>{
  for(const q of [tag+'%',tag+"' OR 1=1 --",tag+'_'])assert.equal((await searchApproved(reader,q)).results.length,0)
 })
 await check('Reader cannot reach raw draft, evidence, source or review tables',async()=>{
  for(const table of ['revisions','claims','claim_evidence','sources','g1_review_decisions'])
   await assert.rejects(reader.query('SELECT * FROM kg.'+table+' LIMIT 1'),/permission denied/i)
 })
 await check('Evidence belongs only to the exact current public revision and excludes reviewer metadata',async()=>{
  const entry=await readApproved(reader,ids[0])
  assert.equal(entry?.revision_id,firstRevision);assert.equal(entry?.evidence.length,1)
  assert.equal(entry?.evidence[0].source_id,firstSource)
  assert.ok(!JSON.stringify(entry).includes('PRIVATE REVIEWER'))
  assert.equal(await readApproved(reader,privateId),undefined)
 })
 await check('A new unpublished revision cannot replace or leak through the approved search and detail',async()=>{
  const marker='PRIVATE_NEW_REVISION_'+randomUUID()
  const newRevision=randomUUID()
  const before=await readApproved(reader,ids[0])
  assert.equal(before?.revision_id,firstRevision)
  await admin.query('INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES($1,$2,$3,$4)',
   [newRevision,ids[0],'en',marker])
  await admin.query('INSERT INTO kg.revision_reader_metadata(revision_id,title,summary,primary_domain) VALUES($1,$2,$3,$4)',
   [newRevision,marker,'Private draft summary','earth'])
  const after=await readApproved(reader,ids[0])
  assert.equal(after?.revision_id,firstRevision)
  assert.equal(after?.body,before?.body)
  assert.equal(after?.title,'Synthetic published title')
  assert.equal(after?.summary,'Synthetic summary')
  assert.equal(after?.primary_domain,'history')
  assert.equal(after?.evidence[0]?.source_id,firstSource)
  assert.ok(!JSON.stringify(after).includes(marker))
  assert.equal((await searchApproved(reader,marker)).results.length,0)
  assert.ok((await searchApproved(reader,'Synthetic published title')).results.some(x=>x.entity_id===ids[0]) || (await searchApproved(reader,'Synthetic published title')).hasMore)
  assert.ok((await searchApproved(reader,'SYNTHETIC TEST ONLY '+tag+' published fixture 0')).results.some(x=>x.entity_id===ids[0]))
  const metadata=await reader.query('SELECT * FROM kg.public_revision_metadata WHERE entity_id=$1',[ids[0]])
  assert.equal(metadata.rows.length,1)
  assert.equal(metadata.rows[0].revision_id,firstRevision)
  assert.equal(metadata.rows[0].title,'Synthetic published title')
  assert.equal(metadata.rows[0].primary_domain,'history')
  assert.ok(!JSON.stringify(metadata.rows).includes(marker))
  const history1=await listApprovedDomain(reader,'history')
  assert.ok(history1?.nextCursor)
  let historyPage=history1!
  const historyResults=[...historyPage.results]
  const seenCursors=new Set<string>()
  while(historyPage.nextCursor){
   assert.ok(!seenCursors.has(historyPage.nextCursor),'domain pagination cursor must advance')
   seenCursors.add(historyPage.nextCursor)
   historyPage=(await listApprovedDomain(reader,'history',historyPage.nextCursor))!
   historyResults.push(...historyPage.results)
  }
  assert.ok(historyResults.some(x=>x.entity_id===ids[0]))
  const earth=await listApprovedDomain(reader,'earth')
  assert.ok(!earth?.results.some(x=>x.entity_id===ids[0]))
  assert.equal(await listApprovedDomain(reader,'invalid'),null)
  await assert.rejects(reader.query('SELECT * FROM kg.revision_reader_metadata'),/permission denied/i)
  await assert.rejects(admin.query('UPDATE kg.revision_reader_metadata SET title=$1 WHERE revision_id=$2',['modified',firstRevision]),/IMMUTABLE_REVISION_OR_SNAPSHOT/)
 })
 await check('Published source metadata remains immutable',async()=>{
  await assert.rejects(admin.query('UPDATE kg.sources SET description=$1 WHERE id=$2',['swapped',firstSource]),/IMMUTABLE_REVISION_OR_SNAPSHOT/)
 })
 await check('Contradicting evidence remains present; unsafe source URLs cannot become links',async()=>{
  const entry=await readApproved(reader,conflictId)
  assert.equal(entry?.evidence.length,2)
  assert.ok(entry?.evidence.some(x=>x.stance==='contradicts'))
  assert.equal(safeSourceUrl('javascript:alert(1)'),null)
  assert.equal(safeSourceUrl('https://user:password@example.org/'),null)
 })
 await check('A stale or tampered search projection is hidden',async()=>{
  const body='SYNTHETIC TEST ONLY '+tag+' published fixture 0'
  assert.equal((await searchApproved(reader,body)).results.length,1)
  await admin.query('UPDATE kg.search_projection SET body=$1 WHERE entity_id=$2',['STALE '+tag,ids[0]])
  assert.equal((await searchApproved(reader,body)).results.length,0)
  await admin.query('SELECT kg.project_event(id) FROM kg.outbox WHERE entity_id=$1',[ids[0]])
  assert.equal((await searchApproved(reader,body)).results.length,1)
 })
 server=spawn(process.execPath,['./node_modules/next/dist/bin/next',mode,...(mode==='dev'?['--webpack']:[]),'--hostname','127.0.0.1','--port','3120'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:mode==='dev'?'development':'production',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe'],detached:true})
 server.stdout?.on('data',d=>{log=(log+d.toString()).slice(-12000)})
 server.stderr?.on('data',d=>{log=(log+d.toString()).slice(-12000)})
 const deadline=Date.now()+90000
 let ready=false
 while(Date.now()<deadline){
  if(server.exitCode!==null)throw new Error('Reading server exited: '+log)
  try{if((await request('/search')).status===200){ready=true;break}}catch{}
  await new Promise(r=>setTimeout(r,700))
 }
 assert.ok(ready,log)
 await check('Real HTTP search returns public results and offers the next page without leaking private text',async()=>{
  const r=await request('/search?q='+encodeURIComponent(tag))
  assert.equal(r.status,200)
  assert.ok(r.body.includes('Next results'))
  assert.ok(!r.body.includes('SECRET_UNPUBLISHED_EVIDENCE'))
  assert.ok(!r.body.includes('PRIVATE EDITOR TITLE'))
  assert.match(r.headers.get('cache-control')??'',/no-store/)
  assert.match(r.headers.get('x-robots-tag')??'',/noindex/)
 })
 await check('Real HTTP detail shows body, claim pinpoint, source and revision identity',async()=>{
  const r=await request('/knowledge/'+ids[0])
  assert.equal(r.status,200);assert.ok(r.body.includes(firstRevision))
  assert.ok(r.body.includes('Synthetic supporting reference'))
  assert.ok(r.body.includes('Fixture paragraph 1'))
  assert.ok(!r.body.includes('PRIVATE REVIEWER'))
 })
 await check('Real HTTP preserves disagreement and escapes unsafe source descriptions',async()=>{
  const r=await request('/knowledge/'+conflictId)
  assert.equal(r.status,200);assert.ok(r.body.includes('Contradicts this claim'))
  assert.ok(r.body.includes('&lt;img'))
  assert.ok(!r.body.includes('href="javascript:'))
  assert.ok(!r.body.includes('<img src=x'))
 })
 await check('Unknown, malformed and private IDs cannot be opened via preview query parameters',async()=>{
  for(const id of [privateId,randomUUID(),'not-a-uuid']){
   const r=await request('/knowledge/'+id+'?draft=true&preview=true')
   assert.equal(r.status,404)
   assert.ok(!r.body.includes('SECRET_UNPUBLISHED_EVIDENCE'))
  }
 })
 await check('Empty, oversized, duplicate and invalid-cursor searches produce a usable page',async()=>{
  for(const path of ['/search','/search?q='+('x'.repeat(121)),'/search?q=a&q=b','/search?q='+tag+'&after=invalid']){
   const r=await request(path);assert.equal(r.status,200)
   assert.ok(!r.body.includes('SECRET_UNPUBLISHED_EVIDENCE'))
  }
 })
 await check('Withdrawing a head immediately removes body, citations and stale search projection',async()=>{
  await admin.query('UPDATE kg.heads SET snapshot_id=NULL,version=version+1 WHERE entity_id=$1',[ids[0]])
  assert.equal(await readApproved(reader,ids[0]),undefined)
  const r=await reader.query('SELECT * FROM kg.public_claim_sources WHERE entity_id=$1',[ids[0]])
  assert.equal(r.rows.length,0)
  assert.ok(!(await searchApproved(reader,tag)).results.some(x=>x.entity_id===ids[0]))
  assert.equal((await request('/knowledge/'+ids[0])).status,404)
 })
 console.log('PUBLIC_READING_'+mode.toUpperCase()+'_'+count+'_CHECKS_SUCCESS')
}catch(error){console.error('PUBLIC_READING_SERVER_CONTEXT',log);throw error}
finally{
 await admin.end();await reader.end();clearTimeout(timeout)
 if(server?.pid){try{process.kill(-server.pid,'SIGTERM')}catch{server.kill('SIGTERM')}}
}
