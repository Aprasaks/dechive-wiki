'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'

type Role = 'editor' | 'reviewer' | 'publisher'
type Draft = {
  id: string | number
  title?: string
  body?: string
  _status?: string
  stableEntityId?: string
}
const ui = {
  border:'1px solid #D7D5CD',
  background:'#fff',
  radius:6,
  field:{ width:'100%',padding:'12px 14px',border:'1px solid #A3A297',
    background:'#fff',borderRadius:4,boxSizing:'border-box' as const,
    fontFamily:'Arial, sans-serif',fontSize:15 },
}
export default function StudioClient({ role, email }: { role: Role, email: string }) {
  const [drafts,setDrafts]=useState<Draft[]>([])
  const [title,setTitle]=useState('')
  const [body,setBody]=useState('')
  const [status,setStatus]=useState('')
  const [loading,setLoading]=useState(false)
  const [refreshing,setRefreshing]=useState(true)
  const canRead=role==='editor'||role==='reviewer'

  const refresh=useCallback(async()=>{
    if(!canRead){setDrafts([]);setRefreshing(false);return}
    try{
      setRefreshing(true)
      const response=await fetch('/api/editorial-drafts?draft=true&limit=15&sort=-updatedAt',{
        credentials:'same-origin',cache:'no-store'
      })
      if(!response.ok)throw new Error('Draft list unavailable')
      const json=await response.json()
      setDrafts(Array.isArray(json.docs)?json.docs:[])
    }catch{setStatus('Could not refresh your private drafts. Please sign in again.')}
    finally{setRefreshing(false)}
  },[canRead])
  useEffect(()=>{void refresh()},[refresh])

  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    if(role!=='editor')return
    if(!title.trim()||!body.trim()){
      setStatus('Enter a title and content before saving.')
      return
    }
    setLoading(true)
    setStatus('')
    try{
      const result=await fetch('/api/editorial-drafts?draft=true',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          title:title.trim(),body:body.trim(),
          stableEntityId:crypto.randomUUID(),_status:'draft',
        }),
      })
      if(!result.ok)throw new Error('Save was denied.')
      const json=await result.json()
      if(json.doc?._status!=='draft')throw new Error('Unexpected publication state')
      setStatus('Private draft saved. It is not published or available in search.')
      setTitle('');setBody('')
      await refresh()
    }catch{setStatus('Draft was not saved. Your permissions or session may have changed.')}
    finally{setLoading(false)}
  }

  async function logout(){
    setStatus('')
    try {
      const result=await fetch('/api/staff/logout',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},body:'{}',
      })
      if(!result.ok)throw new Error('Unable to sign out')
      window.location.replace('/studio/login')
    } catch { setStatus('Sign-out failed. Please try again.') }
  }

  return (
    <div style={{fontFamily:'Arial, sans-serif'}}>
      <nav aria-label="Editorial workspace" style={{display:'flex',justifyContent:'space-between',
        alignItems:'center',gap:16,flexWrap:'wrap',borderBottom:'1px solid #D7D5CD',paddingBottom:24}}>
        <a href="/" style={{fontFamily:'Georgia, serif',fontWeight:700,
          letterSpacing:3,color:'#222',textDecoration:'none'}}>DECHIVE.WIKI</a>
        <span style={{fontSize:13,color:'#565B52'}}>{email} · {role}</span>
        <button type="button" onClick={logout} style={{padding:'9px 14px',
          background:'transparent',border:'1px solid #8B8A80',cursor:'pointer'}}>Sign out</button>
      </nav>
      <header style={{padding:'42px 0 32px'}}>
        <p style={{fontSize:12,letterSpacing:2,color:'#5D685C',textTransform:'uppercase'}}>Private editorial system</p>
        <h1 style={{fontFamily:'Georgia, serif',fontSize:40,fontWeight:400,
          margin:'12px 0'}}>Editorial Workspace</h1>
        <p style={{fontSize:16,maxWidth:700,color:'#3E443C'}}>
          Every public article must pass independent evidence review.
          Saving a draft never publishes or indexes content.
        </p>
      </header>
      {role==='editor'&&(
        <section aria-labelledby="new-draft-title" style={{border:ui.border,
          background:ui.background,borderRadius:ui.radius,padding:24,marginBottom:32}}>
          <h2 id="new-draft-title" style={{fontFamily:'Georgia, serif',fontWeight:400,
            fontSize:28,marginTop:0}}>New private draft</h2>
          <form onSubmit={save} style={{display:'grid',gap:16}}>
            <label>Working title
              <input aria-label="Working title" value={title} maxLength={180}
                onChange={e=>setTitle(e.target.value)} style={ui.field} required/>
            </label>
            <label>Article content
              <textarea aria-label="Article content" value={body}
                onChange={e=>setBody(e.target.value)} rows={9}
                style={{...ui.field,resize:'vertical'}} required />
            </label>
            <div>
              <button type="submit" disabled={loading}
                style={{background:'#233D34',color:'#fff',padding:'12px 20px',
                  border:0,cursor:loading?'wait':'pointer'}}>
                {loading?'Saving privately…':'Save private draft'}
              </button>
            </div>
          </form>
        </section>
      )}
      {role==='reviewer'&&(
        <section style={{borderLeft:'3px solid #536D5F',paddingLeft:20,marginBottom:32}}>
          <h2 style={{fontFamily:'Georgia, serif',fontWeight:400}}>Review queue</h2>
          <p>Read submitted drafts below. An approval requires an exact immutable revision
            and verified claim evidence in the Knowledge Core.</p>
        </section>
      )}
      {role==='publisher'&&(
        <section style={{borderLeft:'3px solid #536D5F',paddingLeft:20,marginBottom:32}}>
          <h2 style={{fontFamily:'Georgia, serif',fontWeight:400}}>Publication desk</h2>
          <p>Only independently approved immutable revisions can be released.
            The publication API enforces a distinct publisher role.</p>
        </section>
      )}
      {status&&<p role="status" style={{padding:14,border:ui.border,
        background:'#F1F3EF'}}>{status}</p>}
      {canRead&&(
        <section aria-labelledby="drafts-heading" style={{paddingBottom:60}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
            <h2 id="drafts-heading" style={{fontFamily:'Georgia, serif',
              fontWeight:400}}>Private drafts</h2>
            <button type="button" onClick={()=>void refresh()}
              style={{padding:'8px 12px',background:'transparent',
                border:'1px solid #AAA',cursor:'pointer'}}>Refresh</button>
          </div>
          {refreshing?<p>Loading private drafts…</p>
            :drafts.length===0?<p>No drafts available to your role.</p>
            :<ul style={{listStyle:'none',padding:0}}>
              {drafts.map(d=><li key={String(d.id)}
                style={{borderBottom:'1px solid #D7D5CD',padding:'18px 0'}}>
                <strong style={{fontFamily:'Georgia, serif',fontSize:20}}>
                  {d.title??'Untitled draft'}</strong>
                <div style={{fontSize:12,color:'#4D554C',marginTop:5}}>
                  Private · {d._status??'draft'} · Record {String(d.id)}
                </div>
                <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',
                  color:'#555B53',fontSize:14}}>
                  {(d.body??'').slice(0,460)}{(d.body??'').length>460?'…':''}
                </p>
              </li>)}
            </ul>}
        </section>
      )}
    </div>
  )
}
