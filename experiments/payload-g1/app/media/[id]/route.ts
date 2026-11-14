import {publicPool} from '../../../lib/public-db'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return new Response(null,{status:404})
 try{
  const result=await publicPool().query('SELECT * FROM kg.read_public_studio_media($1::uuid)',[id])
  if(result.rowCount!==1)return new Response(null,{status:404})
  return new Response(new Uint8Array(result.rows[0].data),{headers:{'Content-Type':result.rows[0].content_type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
 }catch{return new Response(null,{status:503})}
}
