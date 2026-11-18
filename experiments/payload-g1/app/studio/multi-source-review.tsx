'use client'
import { useState, type FormEvent } from 'react'

type Source={id:string;url:string;description:string}
type Claim={id:string;statement:string;anchor:string;sourceIds:string[]}
type Media={id:string;objectKey:string;sha256:string;alt:string;credit:string;rightsStatus:'pending'|'cleared'}
type Pack={title:string;body:string;sources:Source[];claims:Claim[];media:Media[]}
type Decision={checked:boolean;note:string;pinpoint:string}
const field={width:'100%',padding:8,boxSizing:'border-box' as const}
function safeUrl(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:undefined}catch{return undefined}}
function id(prefix:string){return prefix+'-'+crypto.randomUUID()}

export function MultiSourceEditor({draftId,initial,onSaved}:{draftId:string|number;initial:unknown;onSaved:()=>void}){
 const existing=initial&&typeof initial==='object'&&!Array.isArray(initial)?initial as Record<string,unknown>:{}
 const [sources,setSources]=useState<Source[]>(Array.isArray(existing.sources)?existing.sources as Source[]:[])
 const [claims,setClaims]=useState<Claim[]>(Array.isArray(existing.claims)?existing.claims as Claim[]:[])
 const [media,setMedia]=useState<Media[]>(Array.isArray(existing.media)?existing.media as Media[]:[])
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function save(event:FormEvent){event.preventDefault();setBusy(true);setMessage('')
  try{const r=await fetch('/api/editorial-drafts/'+encodeURIComponent(String(draftId))+'?draft=true',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({supplementalEvidence:{...existing,sources,claims,media}})})
   if(!r.ok)throw Error();setMessage('Saved privately. A reviewer must inspect each source and image.');onSaved()
  }catch{setMessage('Could not save. Please check your session and try again.')}finally{setBusy(false)}}
 return <form onSubmit={save} style={{display:'grid',gap:14,marginTop:16}}>
  <p>Add sources, then select which sources support each exact statement. Changes are private until reviewed.</p>
  <h4>Sources</h4>{sources.map((s,i)=><fieldset key={s.id}><legend>Source {i+1}</legend>
   <label>Source title<input required style={field} value={s.description} onChange={e=>setSources(v=>v.map(x=>x.id===s.id?{...x,description:e.target.value}:x))}/></label>
   <label>HTTPS link<input type="url" required style={field} value={s.url} onChange={e=>setSources(v=>v.map(x=>x.id===s.id?{...x,url:e.target.value}:x))}/></label>
   <button type="button" onClick={()=>{setSources(v=>v.filter(x=>x.id!==s.id));setClaims(v=>v.map(x=>({...x,sourceIds:x.sourceIds.filter(k=>k!==s.id)})))}}>Remove source</button>
  </fieldset>)}
  <button type="button" onClick={()=>setSources(v=>[...v,{id:id('source'),url:'',description:''}])}>Add source</button>
  <h4>Statements</h4>{claims.map((c,i)=><fieldset key={c.id}><legend>Statement {i+1}</legend>
   <label>Exact statement from the article<textarea required rows={3} style={field} value={c.statement} onChange={e=>setClaims(v=>v.map(x=>x.id===c.id?{...x,statement:e.target.value}:x))}/></label>
   <label>Location in article<input required style={field} placeholder="Section or paragraph" value={c.anchor} onChange={e=>setClaims(v=>v.map(x=>x.id===c.id?{...x,anchor:e.target.value}:x))}/></label>
   <p>Supporting sources</p>{sources.map((s,n)=><label key={s.id} style={{display:'block'}}><input type="checkbox" checked={c.sourceIds.includes(s.id)} onChange={e=>setClaims(v=>v.map(x=>x.id===c.id?{...x,sourceIds:e.target.checked?[...x.sourceIds,s.id]:x.sourceIds.filter(k=>k!==s.id)}:x))}/> {s.description||'Source '+(n+1)}</label>)}
   <button type="button" onClick={()=>setClaims(v=>v.filter(x=>x.id!==c.id))}>Remove statement</button>
  </fieldset>)}
  <button type="button" onClick={()=>setClaims(v=>[...v,{id:id('claim'),statement:'',anchor:'',sourceIds:[]}])}>Add statement</button>
  <h4>Images</h4><p>Include every image displayed in the article and its rights details.</p>
  {media.map((m,i)=><fieldset key={m.id}><legend>Image {i+1}</legend>
   {(['objectKey','sha256','alt','credit'] as const).map(key=><label key={key} style={{display:'block'}}>{{objectKey:'Image path (without leading slash)',sha256:'Image SHA-256',alt:'Alternative text',credit:'Credit and rights source'}[key]}<input required style={field} value={m[key]} onChange={e=>setMedia(v=>v.map(x=>x.id===m.id?{...x,[key]:e.target.value}:x))}/></label>)}
   <button type="button" onClick={()=>setMedia(v=>v.filter(x=>x.id!==m.id))}>Remove image</button>
  </fieldset>)}
  <button type="button" onClick={()=>setMedia(v=>[...v,{id:id('image'),objectKey:'',sha256:'',alt:'',credit:'',rightsStatus:'pending'}])}>Add image</button>
  <button type="submit" disabled={busy}>{busy?'Saving…':'Save source package'}</button>{message&&<p role="status">{message}</p>}
 </form>
}

export function MultiSourceReviewer({draftId}:{draftId:string|number}){
 const [pack,setPack]=useState<Pack|null>(null),[hash,setHash]=useState(''),[issues,setIssues]=useState<string[]>([])
 const [decisions,setDecisions]=useState<Record<string,Decision>>({}),[media,setMedia]=useState<Record<string,{checked:boolean;note:string}>>({})
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[reviewId,setReviewId]=useState<number|null>(null),[revision,setRevision]=useState('')
 const key=(c:string,s:string)=>JSON.stringify([c,s])
 async function load(){setBusy(true);setMessage('');try{const r=await fetch('/api/studio-review-package?draftId='+encodeURIComponent(String(draftId)),{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error();const j=await r.json();setPack(j.package);setHash(j.snapshotHash);setIssues(j.issues);setDecisions({});setMedia({});setReviewId(j.currentReviewId?Number(j.currentReviewId):null);setRevision('')}catch{setMessage('No complete source package is available for review.')}finally{setBusy(false)}}
 async function record(){if(!pack)return;setBusy(true);setMessage('');try{
  const evidence=pack.claims.flatMap(c=>c.sourceIds.map(s=>{const d=decisions[key(c.id,s)];return {claimId:c.id,sourceId:s,verdict:'verified',note:d?.note||'',pinpoint:d?.pinpoint||''}}))
  const rights=pack.media.map(m=>({mediaId:m.id,verdict:'cleared',note:media[m.id]?.note||''}))
  const r=await fetch('/api/multi-source-reviews',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({draftId:Number(draftId),snapshotHash:hash,evidence,media:rights})});if(!r.ok)throw Error();const j=await r.json();if(!j.doc?.id)throw Error();setReviewId(Number(j.doc.id));setMessage('Review recorded privately. It is not yet approved.')
 }catch{setMessage('Review was not recorded. The article may have changed. Reload and inspect it again.')}finally{setBusy(false)}}
 async function stage(){if(!reviewId)return;setBusy(true);setMessage('');try{const r=await fetch('/api/studio-stage-reviewed-evidence',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewId})});if(!r.ok)throw Error();const j=await r.json();if(!j.staged||!j.revisionId)throw Error();setRevision(j.revisionId);setMessage('Review prepared. Approval is still required.')}catch{setMessage('Could not prepare this review. The published article must match the reviewed draft.')}finally{setBusy(false)}}
 async function approve(){if(!reviewId||!revision)return;setBusy(true);setMessage('');try{const r=await fetch('/api/studio-approve-reviewed-evidence',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewId,revisionId:revision})});if(!r.ok)throw Error();const j=await r.json();if(!j.approved)throw Error();setMessage('Approved. The verified sources can now appear with this published revision.')}catch{setMessage('Approval was refused. The published article or review may have changed.')}finally{setBusy(false)}}
 const ready=!!pack&&issues.length===0&&pack.claims.length>0&&pack.claims.every(c=>c.sourceIds.length>0&&c.sourceIds.every(s=>{const d=decisions[key(c.id,s)];return !!d?.checked&&!!d.note.trim()&&!!d.pinpoint.trim()}))&&pack.media.every(m=>!!media[m.id]?.checked&&!!media[m.id]?.note.trim())
 return <section aria-label="Multiple source review" style={{marginTop:16,display:'grid',gap:12}}>
  <button type="button" onClick={()=>void load()} disabled={busy}>Open source package for review</button>
  {pack&&<><h4>{pack.title}</h4><p style={{whiteSpace:'pre-wrap'}}>{pack.body}</p>
   {issues.length>0&&<div role="alert"><p>Package needs correction:</p><ul>{issues.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {pack.claims.flatMap(c=>c.sourceIds.map(sid=>{const s=pack.sources.find(x=>x.id===sid),k=key(c.id,sid),d=decisions[k]||{checked:false,note:'',pinpoint:''};return <fieldset key={k}><legend>Statement and source</legend><p>{c.statement}</p><p>Article location: {c.anchor}</p><p>{s?.description}: {s&&safeUrl(s.url)?<a href={safeUrl(s.url)} target="_blank" rel="noopener noreferrer">Open source</a>:'Invalid source link'}</p>
    <label><input type="checkbox" checked={d.checked} onChange={e=>setDecisions(v=>({...v,[k]:{...d,checked:e.target.checked}}))}/> I inspected this source and verified it supports the statement.</label>
    <label>Exact location in source<input style={field} value={d.pinpoint} onChange={e=>setDecisions(v=>({...v,[k]:{...d,pinpoint:e.target.value}}))}/></label>
    <label>Review note<textarea rows={2} style={field} value={d.note} onChange={e=>setDecisions(v=>({...v,[k]:{...d,note:e.target.value}}))}/></label></fieldset>}))}
   {pack.media.map(m=>{const d=media[m.id]||{checked:false,note:''};return <fieldset key={m.id}><legend>Image rights</legend><p>{m.alt} · {m.objectKey}</p><p>Credit: {m.credit}</p><p>SHA-256: {m.sha256}</p><label><input type="checkbox" checked={d.checked} onChange={e=>setMedia(v=>({...v,[m.id]:{...d,checked:e.target.checked}}))}/> I checked the image, its reuse rights and credit.</label><label>Rights review note<textarea rows={2} style={field} value={d.note} onChange={e=>setMedia(v=>({...v,[m.id]:{...d,note:e.target.value}}))}/></label></fieldset>})}
   <button type="button" disabled={!ready||busy||!!reviewId} onClick={()=>void record()}>Record review</button>
   {reviewId&&!revision&&<button type="button" disabled={busy} onClick={()=>void stage()}>Prepare reviewed evidence</button>}
   {revision&&<button type="button" disabled={busy} onClick={()=>void approve()}>Approve reviewed evidence</button>}
  </>}{message&&<p role="status">{message}</p>}
 </section>
}
