import { createHash } from 'node:crypto'

// Private, in-memory preparation only. This does not write to the CMS or approve
// a manuscript. Source associations and media rights are editorial assertions.
export type EditorialSource={ id:string; url:string; description:string }
export type EditorialClaim={ id:string; statement:string; anchor:string; sourceIds:string[] }
export type EditorialMedia={ id:string; objectKey:string; sha256:string; alt:string; credit:string; rightsStatus:'pending'|'cleared' }
export type EditorialPackage={ title:string; body:string; sources:EditorialSource[]; claims:EditorialClaim[]; media:EditorialMedia[] }
export type PackageInspection={ bodySha256:string; issues:string[]; sourceCount:number; claimCount:number; mediaCount:number; status:'private-unreviewed' }

const ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
const KEY=/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,511}$/
const SHA=/^[a-f0-9]{64}$/i
function nonempty(s:unknown):s is string { return typeof s==='string' && s.trim().length>0 }
function validUrl(value:string):boolean {
 try { const u=new URL(value); return u.protocol==='https:'&&!u.username&&!u.password } catch { return false }
}
function ids(values:{id:string}[],label:string,issues:string[]):Set<string>{
 const seen=new Set<string>()
 for(const item of values){
  if(!ID.test(item.id)||seen.has(item.id))issues.push(`${label}: invalid or duplicate ID`)
  seen.add(item.id)
 }
 return seen
}
export function inspectEditorialPackage(p:EditorialPackage):PackageInspection {
 const issues:string[]=[]
 if(!nonempty(p.title)||p.title.length>180)issues.push('title: required, maximum 180 characters')
 if(!nonempty(p.body))issues.push('body: required')
 const sources=ids(p.sources,'source',issues)
 ids(p.claims,'claim',issues);ids(p.media,'media',issues)
 for(const source of p.sources){
  if(!nonempty(source.description)||!nonempty(source.url)||!validUrl(source.url))issues.push(`source ${source.id}: description and HTTPS URL required`)
 }
 for(const claim of p.claims){
  if(!nonempty(claim.statement)||!p.body.includes(claim.statement))issues.push(`claim ${claim.id}: exact statement must occur in body`)
  if(!nonempty(claim.anchor))issues.push(`claim ${claim.id}: anchor required`)
  if(!claim.sourceIds.length||new Set(claim.sourceIds).size!==claim.sourceIds.length||claim.sourceIds.some(id=>!sources.has(id)))issues.push(`claim ${claim.id}: source references missing, duplicate or unknown`)
 }
 for(const media of p.media){
  if(!KEY.test(media.objectKey)||media.objectKey.split('/').some(part=>part==='..'||part==='.'))issues.push(`media ${media.id}: invalid object key`)
  if(!SHA.test(media.sha256)||!nonempty(media.alt)||!nonempty(media.credit)||!['pending','cleared'].includes(media.rightsStatus))issues.push(`media ${media.id}: checksum, alt text, credit and rights status required`)
 }
 return {bodySha256:createHash('sha256').update(p.body,'utf8').digest('hex'),issues,sourceCount:p.sources.length,claimCount:p.claims.length,mediaCount:p.media.length,status:'private-unreviewed'}
}
