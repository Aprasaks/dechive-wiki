import { notFound } from 'next/navigation'
import { publicPool } from '../../../lib/public-db'
import { UUID,entryTitle,readApproved,safeSourceUrl,type PublicEvidence } from '../../../lib/public-reading'
import '../../reading.css'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const revalidate=0
const stanceLabel={supports:'Supports this claim',contradicts:'Contradicts this claim',uncertain:'Uncertain relevance'}
function Evidence({e}:{e:PublicEvidence}){
 const url=safeSourceUrl(e.locator)
 return <li className="reading-source">
  <strong>{url?<a href={url} target="_blank" rel="noopener noreferrer">{e.description||'Open source'}</a>:<span>{e.description||'Source reference'} <small>(no safe web link)</small></span>}</strong>
  <p><span className={'reading-stance stance-'+e.stance}>{stanceLabel[e.stance]}</span></p>
  <p>Location: {e.pinpoint}</p>
  <small>Checked {new Date(e.checked_at).toISOString().slice(0,10)}</small>
 </li>
}
export default async function KnowledgePage({params}:{params:Promise<{id:string}>}){
 const {id}=await params
 if(!UUID.test(id))notFound()
 const record=await readApproved(publicPool(),id)
 if(!record)notFound()
 const groups=new Map<string,PublicEvidence[]>()
 for(const e of record.evidence)groups.set(e.claim_key,[...(groups.get(e.claim_key)||[]),e])
 return <article className="reading-page">
  <nav className="reading-links" aria-label="Archive navigation"><a href="/">← DECHIVE.WIKI</a><a href="/search">Search the archive</a></nav>
  <p className="reading-eyebrow">DECHIVE.WIKI / VERIFIED KNOWLEDGE</p>
  <h1>{entryTitle(record.body)}</h1>
  <p className="reading-meta">Published revision {record.version} · English · <a href="#claim-sources">Claims &amp; sources</a></p>
  <div className="reading-body" data-testid="public-approved-body">{record.body.split(/\r?\n\s*\r?\n/).map((p,i)=><p key={i}>{p}</p>)}</div>
  <section id="claim-sources" aria-labelledby="sources-heading">
   <h2 id="sources-heading">Claims &amp; sources</h2>
   <p className="reading-note">These references belong to this published revision. Source support, disagreement and uncertainty are shown separately.</p>
   {!groups.size?<p>No public source details are available for this revision.</p>:
    [...groups].map(([key,evidence])=><section className="reading-claim" key={key} id={'claim-'+encodeURIComponent(key)}>
     <h3>{evidence[0].statement}</h3>
     <small>Claim location: {evidence[0].anchor}</small>
     <ul>{evidence.map((e,i)=><Evidence key={e.source_id+'-'+i} e={e}/>)}</ul>
    </section>)}
  </section>
  <footer className="reading-revision"><strong>Revision record</strong><p>Version {record.version}</p><p>Revision ID: <code>{record.revision_id}</code></p><p>Content checksum: <code>{record.checksum}</code></p></footer>
 </article>
}
