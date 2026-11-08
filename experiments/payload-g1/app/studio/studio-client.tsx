'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import PrivateArticlePreview, {type Snapshot} from './private-article-preview'

type Role = 'editor' | 'reviewer' | 'publisher'
type Draft = {
  id: string | number
  title?: string
  body?: string
  _status?: string
  stableEntityId?: string
  supplementalEvidence?: {privateSnapshot?: Snapshot} | null
}
type ReviewRecord = {
  revisionId: string
  draftId: number
  submittedBy: number
  entityId: string
  body: string
  revisionChecksum: string
  locator: string
  sourceDescription: string
  claim: string
  anchor: string
  pinpoint: string
  licenseDeclaration: string
  status: 'needs-review'|'accepted'|'rejected'
  sourceVerdict: string
  rightsVerdict: string
  reviewNote: string|null
  reviewerStaffId: number|null
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
  const [activeEvidenceDraft,setActiveEvidenceDraft]=useState<string|null>(null)
  const [activeSnapshot,setActiveSnapshot]=useState<string|null>(null)
  const [sourceUrl,setSourceUrl]=useState('')
  const [sourceDescription,setSourceDescription]=useState('')
  const [claim,setClaim]=useState('')
  const [pinpoint,setPinpoint]=useState('')
  const [licenseDeclaration,setLicenseDeclaration]=useState('unknown')
  const [evidenceBusy,setEvidenceBusy]=useState(false)
  const [reviewItems,setReviewItems]=useState<ReviewRecord[]>([])
  const [reviewLoading,setReviewLoading]=useState(false)
  const [activeReview,setActiveReview]=useState<string|null>(null)
  const [reviewNote,setReviewNote]=useState('')
  const [sourceVerified,setSourceVerified]=useState(false)
  const [rightsCleared,setRightsCleared]=useState(false)
  const [decisionBusy,setDecisionBusy]=useState(false)
  const [hydrated,setHydrated]=useState(false)
  useEffect(()=>setHydrated(true),[])
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
  const refreshReviewQueue=useCallback(async()=>{
    if(role!=='reviewer')return
    setReviewLoading(true)
    try{
      const response=await fetch('/api/g1-review-queue',{
        credentials:'same-origin',cache:'no-store',
      })
      if(!response.ok)throw new Error('Unable to load pending evidence queue')
      const json=await response.json()
      setReviewItems(Array.isArray(json.records)?json.records:[])
    }catch{
      setStatus('Could not load the private evidence review queue.')
    }finally{setReviewLoading(false)}
  },[role])
  useEffect(()=>{void refreshReviewQueue()},[refreshReviewQueue])


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

  async function submitEvidence(event:FormEvent<HTMLFormElement>, draft:Draft) {
    event.preventDefault()
    if(role!=='editor' || !hydrated || evidenceBusy)return
    if(!draft.body?.includes(claim.trim())){
      setStatus('The selected claim must occur verbatim in the draft body.')
      return
    }
    setEvidenceBusy(true)
    setStatus('')
    try{
      const result=await fetch('/api/g1-candidate',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          draftId:draft.id,sourceUrl:sourceUrl.trim(),
          sourceDescription:sourceDescription.trim(),
          claim:claim.trim(),anchor:'paragraph-1',
          pinpoint:pinpoint.trim(),licenseDeclaration,
        }),
      })
      if(!result.ok)throw new Error('Submission denied')
      const json=await result.json()
      if(json.queued!==true||json.status!=='needs-review')throw new Error('Unexpected candidate status')
      setStatus('Evidence submitted for independent review. NOT published. Candidate: '+json.revisionId)
      setActiveEvidenceDraft(null)
      setSourceUrl('');setSourceDescription('');setClaim('');setPinpoint('')
      setLicenseDeclaration('unknown')
    }catch{
      setStatus('Evidence was not submitted. Check the claim, source, ownership and candidate state.')
    }finally{setEvidenceBusy(false)}
  }

  async function recordReview(item:ReviewRecord,decision:'accepted'|'rejected'){
    if(role!=='reviewer'||!hydrated||decisionBusy)return
    if(reviewNote.trim().length<20){
      setStatus('Document your reason in at least 20 characters.')
      return
    }
    if(decision==='accepted' && (!sourceVerified||!rightsCleared)){
      setStatus('Source verification and reuse rights must both be checked.')
      return
    }
    setDecisionBusy(true);setStatus('')
    try{
      const response=await fetch('/api/g1-review-decision',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          revisionId:item.revisionId,decision,
          sourceVerdict:decision==='accepted'?'verified':'disputed',
          rightsVerdict:decision==='accepted'?'cleared':'not-cleared',
          note:reviewNote.trim(),
        }),
      })
      if(!response.ok)throw new Error('Reviewer decision denied')
      const json=await response.json()
      if(!json.decided)throw new Error('Decision not recorded')
      setStatus(decision==='accepted'
        ?'Independent review recorded. A separate approval is still needed; nothing is public.'
        :'Candidate rejected. This decision is permanently recorded and cannot publish.')
      setActiveReview(null);setReviewNote('');setSourceVerified(false);setRightsCleared(false)
      await refreshReviewQueue()
    }catch{
      setStatus('Decision was not recorded. Confirm the source, rights and immutable state.')
    }finally{setDecisionBusy(false)}
  }

  async function approveReviewedRevision(item:ReviewRecord){
    if(role!=='reviewer'||item.status!=='accepted'||decisionBusy)return
    setDecisionBusy(true);setStatus('')
    try{
      const response=await fetch('/api/g1-approve',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({draftId:item.draftId,revisionId:item.revisionId}),
      })
      if(!response.ok)throw new Error('Approval requires matching immutable evidence')
      const json=await response.json()
      if(json.approved!==true)throw new Error('Approval not recorded')
      setStatus('Revision approved. Publication is still restricted to a separate publisher.')
    }catch{
      setStatus('Revision approval refused, or it was already approved.')
    }finally{setDecisionBusy(false)}
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
    <div data-studio-ready={hydrated?'true':'false'} style={{fontFamily:'Arial, sans-serif'}}>
      <nav aria-label="Editorial workspace" style={{display:'flex',justifyContent:'space-between',
        alignItems:'center',gap:16,flexWrap:'wrap',borderBottom:'1px solid #D7D5CD',paddingBottom:24}}>
        <a href="/" style={{fontFamily:'Georgia, serif',fontWeight:700,
          letterSpacing:3,color:'#222',textDecoration:'none'}}>DECHIVE.WIKI</a>
        <span style={{fontSize:13,color:'#565B52'}}>{email} · {role}</span>
        <button type="button" onClick={logout} disabled={!hydrated} style={{padding:'9px 14px',
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
              <button type="submit" disabled={loading||!hydrated}
                style={{background:'#233D34',color:'#fff',padding:'12px 20px',
                  border:0,cursor:loading?'wait':'pointer'}}>
                {loading?'Saving privately…':'Save private draft'}
              </button>
            </div>
          </form>
        </section>
      )}
      {role==='reviewer'&&(
        <section aria-labelledby="review-queue-heading"
          style={{borderLeft:'3px solid #536D5F',paddingLeft:20,marginBottom:32}}>
          <h2 id="review-queue-heading" style={{fontFamily:'Georgia, serif',fontWeight:400}}>
            Independent evidence review
          </h2>
          <p>Examine the original source, exact statement, cited location and reuse rights.
            Editor-supplied citations are assertions, not proof. Recording a decision is not publication.</p>
          <button type="button" onClick={()=>void refreshReviewQueue()} disabled={!hydrated||reviewLoading}
            style={{padding:'8px 12px',border:'1px solid #AAA',background:'#fff'}}>
            Refresh evidence queue
          </button>
          {reviewLoading?<p>Loading submitted sources…</p>
            :reviewItems.length===0?<p>No candidate sources submitted.</p>
            :<ul style={{listStyle:'none',padding:0}}>
              {reviewItems.map(item=><li key={item.revisionId}
                style={{border:ui.border,background:'#fff',padding:20,margin:'20px 0'}}>
                <strong style={{fontFamily:'Georgia, serif',fontSize:20}}>
                  Candidate {item.revisionId.slice(0,8)}
                </strong>
                <p style={{fontSize:13}}>Status: <strong>{item.status}</strong>
                  {' · '}Editor license claim: {item.licenseDeclaration}
                </p>
                <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:14}}>
                  {item.body}
                </p>
                <p><strong>Editor-reported claim:</strong> {item.claim}</p>
                <p><strong>Editor-submitted source (unverified):</strong>{' '}
                  <a href={item.locator} target="_blank" rel="noopener noreferrer nofollow"
                    style={{overflowWrap:'anywhere',color:'#244C3D'}}>{item.locator}</a></p>
                <p><strong>Reported source description:</strong> {item.sourceDescription}</p>
                <p><strong>Claim anchor:</strong> {item.anchor}</p>
                <p><strong>Pinpoint:</strong> {item.pinpoint}</p>
                {item.status==='needs-review'?(
                  <div>
                    <button type="button" disabled={!hydrated} onClick={()=>{
                      setActiveReview(activeReview===item.revisionId?null:item.revisionId)
                      setReviewNote('');setSourceVerified(false);setRightsCleared(false)
                    }} style={{padding:'8px 12px',border:'1px solid #7E8B7D',background:'#F6F7F3'}}>
                      {activeReview===item.revisionId?'Close review':'Evaluate this candidate'}
                    </button>
                    {activeReview===item.revisionId&&(
                      <form aria-label="Independent source and rights decision"
                        onSubmit={e=>e.preventDefault()} style={{display:'grid',gap:12,marginTop:14}}>
                        <label>
                          <input type="checkbox" checked={sourceVerified}
                            onChange={e=>setSourceVerified(e.target.checked)}/>
                          {' '}I independently inspected the source and verified exact claim support
                        </label>
                        <label>
                          <input type="checkbox" checked={rightsCleared}
                            onChange={e=>setRightsCleared(e.target.checked)}/>
                          {' '}I independently confirmed reuse rights and attribution requirements
                        </label>
                        <label>Reasoned review note (required)
                          <textarea aria-label="Reasoned review note"
                            minLength={20} maxLength={2000} required rows={4}
                            value={reviewNote} onChange={e=>setReviewNote(e.target.value)}
                            style={{...ui.field,resize:'vertical'}}/>
                        </label>
                        <p style={{fontSize:13,color:'#5D5E56',margin:0}}>
                          You cannot accept unknown rights or permission-required sources.
                          Rejection is permanent for this revision; corrections require a new candidate.
                        </p>
                        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                          <button type="button" disabled={!hydrated||decisionBusy||!sourceVerified||!rightsCleared||
                            !['public-domain','cc-by-4.0'].includes(item.licenseDeclaration)||
                            reviewNote.trim().length<20}
                            onClick={()=>void recordReview(item,'accepted')}
                            style={{padding:'11px 16px',border:0,background:'#233D34',color:'#fff'}}>
                            Record independent acceptance
                          </button>
                          <button type="button" disabled={!hydrated||decisionBusy||reviewNote.trim().length<20}
                            onClick={()=>void recordReview(item,'rejected')}
                            style={{padding:'11px 16px',border:'1px solid #9E5148',background:'#fff'}}>
                            Reject candidate
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ):<div>
                  <p><strong>Decision:</strong> {item.status}</p>
                  {item.reviewNote&&<p><strong>Signed note:</strong> {item.reviewNote}</p>}
                  {item.status==='accepted'&&(
                    <button type="button" disabled={!hydrated||decisionBusy}
                      onClick={()=>void approveReviewedRevision(item)}
                      style={{padding:'10px 14px',border:0,color:'#fff',background:'#233D34'}}>
                      Separately approve reviewed revision
                    </button>
                  )}
                </div>}
              </li>)}
            </ul>}
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
                  {d.supplementalEvidence?.privateSnapshot ? 'Imported article snapshot — open the private preview below.' : <>{(d.body??'').slice(0,460)}{(d.body??'').length>460?'…':''}</>}
                </p>
                {d.body&&d.supplementalEvidence?.privateSnapshot&&<div>
                  <button type="button" disabled={!hydrated} onClick={()=>setActiveSnapshot(activeSnapshot===String(d.id)?null:String(d.id))}>
                    {activeSnapshot===String(d.id)?'Close private preview':'Open private preview'}
                  </button>
                  {activeSnapshot===String(d.id)&&<PrivateArticlePreview body={d.body} snapshot={d.supplementalEvidence.privateSnapshot}/>}
                </div>}
                {role==='editor'&&(
                  <div style={{padding:'12px 0 4px'}}>
                    <button type="button" disabled={!hydrated}
                      onClick={()=>{
                        const key=String(d.id)
                        setActiveEvidenceDraft(activeEvidenceDraft===key?null:key)
                        setClaim('');setSourceUrl('');setPinpoint('')
                        setSourceDescription('');setLicenseDeclaration('unknown')
                      }}
                      style={{padding:'9px 12px',border:'1px solid #536D5F',
                        color:'#233D34',background:'#fff',cursor:'pointer'}}>
                      {activeEvidenceDraft===String(d.id)?'Close evidence form':'Attach source & request review'}
                    </button>
                    {activeEvidenceDraft===String(d.id)&&(
                      <form onSubmit={e=>void submitEvidence(e,d)} aria-label="Source evidence submission"
                        style={{display:'grid',gap:12,padding:20,marginTop:12,
                          background:'#F6F7F3',border:ui.border}}>
                        <strong>Source and claim — not independently verified</strong>
                        <p style={{margin:0,fontSize:13,color:'#586356'}}>
                          A citation is an editor assertion, not proof. A separate reviewer
                          must check the source, statement, permissions and rights.
                          This form cannot publish an article.
                        </p>
                        <label>Source URL (HTTPS only)
                          <input aria-label="Source URL" type="url" required
                            value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)}
                            placeholder="https://example.invalid/reference" style={ui.field}/>
                        </label>
                        <label>Source description
                          <input aria-label="Source description" required
                            minLength={12} maxLength={700}
                            value={sourceDescription} onChange={e=>setSourceDescription(e.target.value)}
                            style={ui.field}/>
                        </label>
                        <label>Exact claim from this draft
                          <textarea aria-label="Exact claim from draft" required
                            minLength={8} maxLength={700} rows={3}
                            value={claim} onChange={e=>setClaim(e.target.value)}
                            style={{...ui.field,resize:'vertical'}}/>
                        </label>
                        <label>Source pinpoint (page, section, timestamp)
                          <input aria-label="Source pinpoint" required
                            minLength={3} maxLength={300}
                            value={pinpoint} onChange={e=>setPinpoint(e.target.value)}
                            style={ui.field}/>
                        </label>
                        <label>Editor license declaration (unverified)
                          <select aria-label="Editor license declaration" value={licenseDeclaration}
                            onChange={e=>setLicenseDeclaration(e.target.value)} style={ui.field}>
                            <option value="unknown">Unknown — must review</option>
                            <option value="public-domain">Claimed public domain</option>
                            <option value="cc-by-4.0">Claimed CC BY 4.0</option>
                            <option value="permission-required">Permission required</option>
                          </select>
                        </label>
                        <div>
                          <button type="submit" disabled={!hydrated||evidenceBusy}
                            style={{padding:'10px 16px',border:0,color:'#fff',
                              background:'#233D34',cursor:evidenceBusy?'wait':'pointer'}}>
                            {evidenceBusy?'Submitting…':'Queue for independent review'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </li>)}
            </ul>}
        </section>
      )}
    </div>
  )
}

