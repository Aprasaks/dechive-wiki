import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
const db=new Pool({connectionString:process.env.DATABASE_URL})
const id=randomUUID(),revision=randomUUID(),source=randomUUID()
await db.query('INSERT INTO kg.entities(id,kind,name) VALUES($1,$2,$3)',[id,'concept','HTTP test article'])
await db.query('INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES($1,$2,$3,$4)',[revision,id,'en','# HTTP test article'])
await db.query('INSERT INTO kg.revision_reader_metadata(revision_id,title,summary,primary_domain) VALUES($1,$2,$3,$4)',[revision,'HTTP test article','A test article','history'])
await db.query('INSERT INTO kg.claims(revision_id,claim_key,anchor,statement) VALUES($1,$2,$3,$4)',[revision,'test-claim','intro','HTTP test article'])
await db.query('INSERT INTO kg.sources(id,locator,description) VALUES($1,$2,$3)',[source,'https://example.invalid/'+source,'Synthetic source'])
await db.query('INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) VALUES($1,$2,$3,$4,$5,$6)',[revision,'test-claim',source,'supports','Test paragraph','synthetic reviewer'])
await db.query('INSERT INTO kg.approvals(revision_id,reviewer) VALUES($1,$2)',[revision,'synthetic reviewer'])
await db.query('SELECT kg.publish($1,$2,0)',[id,revision])
await db.query('SELECT kg.project_event(id) FROM kg.outbox WHERE entity_id=$1',[id])
const base='http://127.0.0.1:3120'
async function account(label:string){
 const res=await fetch(base+'/api/member/auth/sign-up/email',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({name:label,email:`${label}-${Date.now()}@example.test`,password:'reader-http-password-123'})})
 assert.equal(res.status,200,await res.clone().text())
 const cookie=res.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')
 assert.ok(cookie.includes('session_token'))
 return cookie
}
async function bookmarks(cookie:string,method='GET',body?:unknown,origin=base){return fetch(base+'/api/member/bookmarks',{method,headers:{cookie,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})}
const anon=await fetch(base+'/api/member/bookmarks');assert.equal(anon.status,401)
const a=await account('reader-a'),b=await account('reader-b')
const badOrigin=await bookmarks(a,'POST',{entityId:id},'https://other.example');assert.equal(badOrigin.status,403)
const saved=await bookmarks(a,'POST',{entityId:id});assert.equal(saved.status,200,await saved.clone().text())
const listA=await bookmarks(a);assert.equal((await listA.json()).bookmarks[0].entity_id,id)
const listB=await bookmarks(b);assert.equal((await listB.json()).bookmarks.length,0)
const removed=await bookmarks(a,'DELETE',{entityId:id});assert.equal(removed.status,200)
const after=await bookmarks(a);assert.equal((await after.json()).bookmarks.length,0)
console.log('PASS: real HTTP signup, session cookies, CSRF guard, bookmark save/list/isolation/remove')
await db.end()
