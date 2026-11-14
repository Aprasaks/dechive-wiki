import { notFound } from 'next/navigation'
import { publicPool } from '../../../lib/public-db'
import { UUID,domainName,entryTitle,readApproved,listRelatedApproved,safeSourceUrl,type PublicEvidence } from '../../../lib/public-reading'
import { ArticleBody,articleHeadings } from '../../../lib/article-body'
import ShareControls from '../share-controls'
import SiteHeader from '../../site-header'
import '../../reference-home.css'
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
 const title=record.title || entryTitle(record.body)
 const firstLine=record.body.match(/^\s*#\s+([^\n]+)\r?\n+/)
 const body=firstLine && firstLine[1].trim().toLocaleLowerCase()===title.trim().toLocaleLowerCase()
   ? record.body.slice(firstLine[0].length) : record.body
 const groups=new Map<string,PublicEvidence[]>()
 for(const e of record.evidence)groups.set(e.claim_key,[...(groups.get(e.claim_key)||[]),e])
 const headings=articleHeadings(body).filter(h=>h.text.toLowerCase()!=='contents')
 return <div className="knowledge-shell">
  <div className="reference-home knowledge-header"><SiteHeader/></div>
  <div className="knowledge-layout">
  <aside className="knowledge-toc" aria-label="Table of contents"><strong>Contents</strong><ol>{headings.map(h=><li key={h.id}><a href={'#'+h.id}>{h.text}</a></li>)}</ol></aside>
  <article className="reading-page">
  <nav className="reading-links" aria-label="Archive navigation"><a href="/">← DECHIVE.WIKI</a><a href="/search">Search the archive</a></nav>
  <p className="reading-eyebrow">DECHIVE.WIKI / KNOWLEDGE ARCHIVE</p>
  {record.primary_domain && domainName(record.primary_domain) && <p><a href={'/domains/'+record.primary_domain}>{domainName(record.primary_domain)}</a></p>}
  <h1>{title}</h1>
  {record.summary && <p>{record.summary}</p>}
  <p className="reading-meta">Published revision {record.version} · English · <a href="#claim-sources">Claims &amp; sources</a></p>
  <ShareControls entryId={id} title={record.title || entryTitle(record.body)}/>
  <ArticleBody body={body}/>
  <section id="claim-sources" aria-labelledby="sources-heading">
   <h2 id="sources-heading">Claims &amp; sources</h2>
   {groups.size>0 && <p className="reading-note">These references belong to this published revision. Source support, disagreement and uncertainty are shown separately.</p>}
   {!groups.size?<p>No separate source details have been added.</p>:
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
 </div>
 </div>
}
