import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Pool } from 'pg'
import { getPayload } from 'payload'
import config from '../native-auth.config.ts'

const admin=new Pool({connectionString:process.env.DATABASE_URL})
const base='http://127.0.0.1:3188'
const password=randomBytes(24).toString('hex')
const editor='editor-'+randomUUID()+'@example.invalid',reviewer='reviewer-'+randomUUID()+'@example.invalid'
const timeout=setTimeout(()=>{console.error('HTTP_TEST_TIMEOUT');process.exit(124)},180000)
const payload=await getPayload({config})
for(const [email,role] of [[editor,'editor'],[reviewer,'reviewer']] as const){
 await payload.create({collection:'staff',overrideAccess:true,data:{email,password,role}})
}
await Promise.race([payload.db.destroy?.(),new Promise(resolve=>setTimeout(resolve,4000))])
const child=spawn(process.execPath,['./node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3188'],
 {cwd:process.cwd(),env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'development'},stdio:['ignore','pipe','pipe'],detached:true})
let log='';child.stdout.on('data',p=>{log=(log+p).slice(-8000)});child.stderr.on('data',p=>{log=(log+p).slice(-8000)})
async function call(path:string,method='GET',body?:unknown,token?:string){
 const r=await fetch(base+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'JWT '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)})
 const text=await r.text();let data:any;try{data=JSON.parse(text)}catch{data=null};return {status:r.status,text,data}
}
function success(r:{status:number;text:string}){assert.ok(r.status>=200&&r.status<300,`${r.status} ${r.text.slice(0,500)}`)}
let successStatus=false
try{
 let ready=false
 for(let i=0;i<100;i++){try{if((await fetch(base+'/',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,1000))}
 assert.ok(ready,'Next server did not start: '+log)
 const logIn=async(email:string)=>{const r=await call('/api/staff/login','POST',{email,password});success(r);assert.ok(r.data.token);return r.data.token as string}
 const editorToken=await logIn(editor),reviewerToken=await logIn(reviewer)
 const entity=randomUUID(),body='A documented synthetic statement.'
 const sources=[{id:'s1',url:'https://example.org/one',description:'Source one'},{id:'s2',url:'https://example.org/two',description:'Source two'}]
 const claims=[{id:'c1',statement:body,anchor:'introduction',sourceIds:['s1','s2']}]
 let r=await call('/api/editorial-drafts?draft=true','POST',{stableEntityId:entity,title:'Synthetic review',body,supplementalEvidence:{sources,claims,media:[]},_status:'draft'},editorToken);success(r)
 const draftId=r.data.doc.id
 r=await call('/api/studio-publish','POST',{draftId,summary:'Synthetic summary',domain:'science'},editorToken);assert.equal(r.status,409)
 r=await call('/api/studio-review-package?draftId='+draftId);assert.ok([401,403].includes(r.status))
 r=await call('/api/studio-review-package?draftId='+draftId,'GET',undefined,editorToken);success(r)
 r=await call('/api/studio-review-package?draftId='+draftId,'GET',undefined,reviewerToken);success(r);assert.deepEqual(r.data.issues,[])
 const snapshotHash=r.data.snapshotHash
 const evidence=sources.map(s=>({claimId:'c1',sourceId:s.id,verdict:'verified',note:'Synthetic reviewer checked',pinpoint:'Section one'}))
 r=await call('/api/multi-source-reviews','POST',{draftId,snapshotHash,evidence,media:[]},reviewerToken);success(r);const reviewId=r.data.doc.id
 r=await call('/api/studio-review-package?draftId='+draftId,'GET',undefined,reviewerToken);success(r);assert.equal(r.data.currentReviewId,reviewId)
 r=await call('/api/studio-stage-reviewed-evidence','POST',{reviewId},editorToken);assert.equal(r.status,403)
 r=await call('/api/studio-stage-reviewed-evidence','POST',{reviewId},reviewerToken);success(r);assert.equal(r.data.approved,false);const revisionId=r.data.revisionId
 let count=await admin.query('SELECT count(*)::int n FROM kg.public_claim_sources WHERE entity_id=$1',[entity]);assert.equal(count.rows[0].n,0)
 r=await call('/api/studio-stage-reviewed-evidence','POST',{reviewId},reviewerToken);success(r);assert.equal(r.data.revisionId,revisionId)
 r=await call('/api/studio-approve-reviewed-evidence','POST',{reviewId,revisionId},editorToken);assert.equal(r.status,403)
 r=await call('/api/studio-approve-reviewed-evidence','POST',{reviewId,revisionId},reviewerToken);success(r);assert.equal(r.data.approved,true)
 r=await call('/api/studio-approve-reviewed-evidence','POST',{reviewId,revisionId},reviewerToken);success(r);assert.equal(r.data.approved,true)
 count=await admin.query('SELECT count(*)::int n FROM kg.public_claim_sources WHERE entity_id=$1',[entity]);assert.equal(count.rows[0].n,0)
 // Pause the actual publication transaction while a concurrent draft edit attempts to run.
 await admin.query(`CREATE OR REPLACE FUNCTION kg.test_pause_studio_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title='Synthetic review' THEN PERFORM pg_sleep(2); END IF; RETURN NEW; END $$`)
 await admin.query('CREATE TRIGGER test_pause_studio_publication BEFORE INSERT ON kg.studio_public_revisions FOR EACH ROW EXECUTE FUNCTION kg.test_pause_studio_publication()')
 const publishing=call('/api/studio-publish','POST',{draftId,summary:'Synthetic summary',domain:'science'},editorToken)
 let paused=false
 for(let i=0;i<40;i++){const q=await admin.query("SELECT 1 FROM pg_stat_activity WHERE wait_event='PgSleep' AND query LIKE '%publish_reviewed_studio_draft%'");if(q.rowCount){paused=true;break}await new Promise(done=>setTimeout(done,50))}
 assert.ok(paused,'publication did not reach concurrency test barrier')
 let edited=false
 const editing=call('/api/editorial-drafts/'+draftId+'?draft=true','PATCH',{body:'Updated article.'},editorToken).then(x=>{edited=true;return x})
 await new Promise(done=>setTimeout(done,200));assert.equal(edited,false,'draft edit overtook publication')
 r=await publishing;success(r)
 r=await editing;success(r)
 await admin.query('DROP TRIGGER test_pause_studio_publication ON kg.studio_public_revisions')
 count=await admin.query('SELECT count(*)::int n FROM kg.public_claim_sources WHERE entity_id=$1',[entity]);assert.equal(count.rows[0].n,2)
 r=await call('/api/studio-publish','POST',{draftId,summary:'Updated summary',domain:'science'},editorToken);assert.equal(r.status,409)
 count=await admin.query('SELECT count(*)::int n FROM kg.public_claim_sources WHERE entity_id=$1',[entity]);assert.equal(count.rows[0].n,2)
 console.log('Authenticated multi-source publication flow passed');successStatus=true
}catch(e){console.error('STUDIO_HTTP_FAILURE_CONTEXT',log.slice(-5000));console.error(e)}
finally{clearTimeout(timeout);try{process.kill(-child.pid!,'SIGTERM')}catch{}await admin.end()}
process.exit(successStatus?0:1)
