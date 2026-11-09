import { notFound } from 'next/navigation'
import { publicPool } from '../../../lib/public-db'
import { UUID,domainName,entryTitle,readApproved,listRelatedApproved,safeSourceUrl,type PublicEvidence } from '../../../lib/public-reading'
import { ArticleBody } from '../../../lib/article-body'
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
 const reader=publicPool()
 const record=await readApproved(reader,id)
 if(!record)notFound()
 const related=await listRelatedApproved(reader,id)
 const groups=new Map<string,PublicEvidence[]>()
 for(const e of record.evidence)groups.set(e.claim_key,[...(groups.get(e.claim_key)||[]),e])
 return <article className="reading-page">
  <nav className="reading-links" aria-label="Archive navigation"><a href="/">← DECHIVE.WIKI</a><a href="/search">Search the archive</a></nav>
  <p className="reading-eyebrow">DECHIVE.WIKI / VERIFIED KNOWLEDGE</p>
  {record.primary_domain && domainName(record.primary_domain) && <p><a href={'/domains/'+record.primary_domain}>{domainName(record.primary_domain)}</a></p>}
  <h1>{record.title || entryTitle(record.body)}</h1>
  {record.summary && <p>{record.summary}</p>}
  <p className="reading-meta">Published revision {record.version} · English · <a href="#claim-sources">Claims &amp; sources</a></p>
  <ArticleBody body={record.body}/>
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
  <section className="reading-related" aria-labelledby="related-heading">
   <h2 id="related-heading">Continue exploring</h2>
   {related.length?<ul className="reading-related-list">{related.map(item=><li key={item.related_entity_id}>
    <a href={'/knowledge/'+item.related_entity_id}>{item.title}</a>
    <p>{item.summary}</p>
    <small>{domainName(item.primary_domain)||'Knowledge'} · Published revision {item.related_version}</small>
   </li>)}</ul>:
    <p className="reading-note">No related published entries yet.</p>}
  </section>
  <footer className="reading-revision"><strong>Revision record</strong><p>Version {record.version}</p><p>Revision ID: <code>{record.revision_id}</code></p><p>Content checksum: <code>{record.checksum}</code></p></footer>
 </article>
}
