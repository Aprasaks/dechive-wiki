import type { Pool } from 'pg'

export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type PublicEntry={entity_id:string;locale:string;version:string|number;revision_id:string;body:string}
export type PublicEvidence={
 claim_key:string;anchor:string;statement:string;source_id:string;
 locator:string;description:string;accessed_at:Date|string;
 stance:'supports'|'contradicts'|'uncertain';pinpoint:string;checked_at:Date|string
}
type Reader=Pick<Pool,'query'>
export function searchTerm(value:unknown):string|null {
 if(typeof value!=='string')return null
 const term=value.trim()
 return term.length>0&&term.length<=120?term:null
}
export function safeSourceUrl(value:string):string|null {
 try{
  const url=new URL(value)
  return url.protocol==='https:'&&!url.username&&!url.password?url.href:null
 }catch{return null}
}
export function entryTitle(body:string):string {
 const first=body.trim().split(/\r?\n/)[0]||'Knowledge record'
 return first.length>110?first.slice(0,107)+'…':first
}
export async function searchApproved(reader:Reader,term:string,after?:string){
 if(!searchTerm(term)||(after!==undefined&&!UUID.test(after)))
  return {results:[] as PublicEntry[],hasMore:false,nextCursor:null as string|null}
 const result=await reader.query(
  "SELECT entity_id,locale,version,revision_id,body FROM kg.public_search_verified "+
  "WHERE locale='en' AND position(lower($1::text) in lower(body))>0 "+
  "AND ($2::uuid IS NULL OR entity_id>$2::uuid) ORDER BY entity_id LIMIT 21",
  [term,after??null])
 const rows=result.rows as PublicEntry[]
 const results=rows.slice(0,20),hasMore=rows.length>20
 return {results,hasMore,nextCursor:hasMore?results[results.length-1].entity_id:null}
}
export async function readApproved(reader:Reader,id:string){
 if(!UUID.test(id))return null
 // A single statement gives the body and its citations one MVCC snapshot,
 // including if publication/withdrawal happens concurrently.
 const result=await reader.query(
  "SELECT p.entity_id,p.locale,p.version,p.revision_id,p.body,p.checksum,"+
  "coalesce((SELECT jsonb_agg(jsonb_build_object("+
  "'claim_key',e.claim_key,'anchor',e.anchor,'statement',e.statement,"+
  "'source_id',e.source_id,'locator',e.locator,'description',e.description,"+
  "'accessed_at',e.accessed_at,'stance',e.stance,'pinpoint',e.pinpoint,'checked_at',e.checked_at) "+
  "ORDER BY e.claim_key,e.source_id,e.stance,e.pinpoint) "+
  "FROM kg.public_claim_sources e WHERE e.entity_id=p.entity_id AND e.locale=p.locale "+
  "AND e.revision_id=p.revision_id AND e.version=p.version),'[]'::jsonb) AS evidence "+
  "FROM kg.public_entries p WHERE p.entity_id=$1::uuid AND p.locale='en' LIMIT 1",[id])
 return result.rows[0] as (PublicEntry&{checksum:string;evidence:PublicEvidence[]})|undefined
}
