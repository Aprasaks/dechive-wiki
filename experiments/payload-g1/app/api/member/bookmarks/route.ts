import {headers} from 'next/headers'
import {memberAuth,memberDatabase} from '../../../../lib/member-auth'
import {publicPool} from '../../../../lib/public-db'
import {UUID,entryImage} from '../../../../lib/public-reading'
export const runtime='nodejs'
export const dynamic='force-dynamic'

async function userId(){return (await memberAuth.api.getSession({headers:await headers()}))?.user.id ?? null}
function sameOrigin(request:Request){
 const origin=request.headers.get('origin')
 return !!origin && !!process.env.MEMBER_AUTH_URL && origin===new URL(process.env.MEMBER_AUTH_URL).origin
}
async function withUser<T>(id:string,fn:(client:import('pg').PoolClient)=>Promise<T>){
 const client=await memberDatabase.connect()
 try{
  await client.query('BEGIN')
  await client.query("SELECT set_config('reader_member.user_id',$1,true)",[id])
  const result=await fn(client)
  await client.query('COMMIT')
  return result
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export async function GET(){
 const id=await userId()
 if(!id)return Response.json({error:'Sign in required'},{status:401})
 const saved=await withUser(id,c=>c.query('SELECT entity_id,created_at FROM reader_member.bookmarks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 500',[id]))
 const ids=saved.rows.map(row=>row.entity_id)
 if(!ids.length)return Response.json({bookmarks:[],connections:[]},{headers:{'Cache-Control':'private, no-store'}})
 const result=await publicPool().query("SELECT p.entity_id,p.body,m.title,m.summary,m.primary_domain FROM kg.public_entries p JOIN kg.public_revision_metadata m ON m.entity_id=p.entity_id AND m.locale=p.locale AND m.revision_id=p.revision_id AND m.version=p.version WHERE p.locale='en' AND p.entity_id=ANY($1::uuid[])",[ids])
 const byId=new Map(result.rows.map(({body,...row})=>[row.entity_id,{...row,image:entryImage(body,row.entity_id)}]))
 const related=await publicPool().query('SELECT DISTINCT entity_id,related_entity_id FROM kg.public_related_entries WHERE entity_id=ANY($1::uuid[]) AND related_entity_id=ANY($1::uuid[]) ORDER BY entity_id,related_entity_id',[ids])
 return Response.json({bookmarks:ids.flatMap(id=>byId.has(id)?[byId.get(id)]:[]),connections:related.rows},{headers:{'Cache-Control':'private, no-store'}})
}
export async function POST(request:Request){return change(request,true)}
export async function DELETE(request:Request){return change(request,false)}
async function change(request:Request,add:boolean){
 if(!sameOrigin(request))return Response.json({error:'Invalid origin'},{status:403})
 const id=await userId()
 if(!id)return Response.json({error:'Sign in required'},{status:401})
 let body:unknown
 try{body=await request.json()}catch{return Response.json({error:'Invalid request'},{status:400})}
 const entityId=(body as {entityId?:unknown})?.entityId
 if(typeof entityId!=='string'||!UUID.test(entityId))return Response.json({error:'Invalid article'},{status:400})
 if(add){
  const found=await publicPool().query("SELECT 1 FROM kg.public_entries WHERE locale='en' AND entity_id=$1::uuid",[entityId])
  if(!found.rowCount)return Response.json({error:'Article not available'},{status:404})
 }
 await withUser(id,c=>add?c.query('INSERT INTO reader_member.bookmarks(user_id,entity_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,entityId]):c.query('DELETE FROM reader_member.bookmarks WHERE user_id=$1 AND entity_id=$2',[id,entityId]))
 return Response.json({saved:add},{headers:{'Cache-Control':'private, no-store'}})
}
