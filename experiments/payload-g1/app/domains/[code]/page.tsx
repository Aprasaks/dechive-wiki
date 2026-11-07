import {notFound} from 'next/navigation'
import {publicPool} from '../../../lib/public-db'
import {domainName,entryTitle,listApprovedDomain,UUID} from '../../../lib/public-reading'
import '../../reading.css'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const revalidate=0
export default async function DomainPage({params,searchParams}:{params:Promise<{code:string}>;searchParams:Promise<{after?:string|string[]}>}){
 const {code}=await params, {after}=await searchParams
 const name=domainName(code)
 if(!name)notFound()
 const valid=after===undefined||(typeof after==='string'&&UUID.test(after))
 const data=valid?await listApprovedDomain(publicPool(),code,after as string|undefined):null
 return <main className="reading-page">
  <nav className="reading-links" aria-label="Archive navigation"><a href="/">← DECHIVE.WIKI</a><a href="/search">Search the archive</a></nav>
  <h1>{name}</h1>
  {!valid?<p role="status">This results link is invalid.</p>:!data?.results.length?<p>No approved records in this domain yet.</p>:
   <ul className="reading-results">{data.results.map(r=><li key={r.entity_id}><h2><a href={'/knowledge/'+r.entity_id}>{r.title||entryTitle(r.body)}</a></h2><p>{r.summary}</p></li>)}</ul>}
  {data?.nextCursor&&<a className="reading-next" href={'/domains/'+code+'?'+new URLSearchParams({after:data.nextCursor}).toString()}>Next results →</a>}
 </main>
}
