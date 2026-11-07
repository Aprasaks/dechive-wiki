import { publicPool } from '../../lib/public-db'
import { entryTitle,searchApproved,searchTerm,UUID } from '../../lib/public-reading'
import '../reading.css'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const revalidate=0
type Params={q?:string|string[];after?:string|string[]}
export default async function SearchPage({searchParams}:{searchParams:Promise<Params>}){
 const params=await searchParams
 const q=searchTerm(params.q)
 const cursorValid=params.after===undefined||(typeof params.after==='string'&&UUID.test(params.after))
 const data=q&&cursorValid?await searchApproved(publicPool(),q,params.after as string|undefined):null
 return <section className="reading-page">
  <a className="reading-back" href="/">← DECHIVE.WIKI</a>
  <p className="reading-eyebrow">EXPLORE THE ARCHIVE</p>
  <h1>Search the archive</h1>
  <form action="/search" method="get" className="reading-search" role="search">
   <label className="reading-label" htmlFor="reading-query">Topic or phrase</label>
   <input id="reading-query" name="q" defaultValue={typeof params.q==='string'?params.q.slice(0,120):''} maxLength={120} placeholder="Search approved knowledge" required/>
   <button type="submit">Search</button>
  </form>
  {!q?<p role="status">Enter a topic or phrase of 1–120 characters.</p>:
   !cursorValid?<p role="status">This results link is invalid. Submit your search again.</p>:
   <><h2>Results for “{q}”</h2>
    {!data?.results.length?<p role="status">No approved records matching “{q}” are available. Try another phrase.</p>:
     <ul className="reading-results">{data.results.map(r=><li key={r.entity_id}>
      <h3><a href={'/knowledge/'+r.entity_id}>{r.title || entryTitle(r.body)}</a></h3>
      <p>{r.summary || (r.body.slice(0,260)+(r.body.length>260?'…':''))}</p>
      <small>Published revision {r.version} · English</small>
     </li>)}</ul>}
    {data?.nextCursor&&<a className="reading-next" href={'/search?'+new URLSearchParams({q,after:data.nextCursor}).toString()}>Next results →</a>}
   </>}
  <p className="reading-note">Only published, approved revisions are searched. Drafts and review notes are excluded.</p>
 </section>
}
