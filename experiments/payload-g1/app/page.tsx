import ArchiveIcon from './archive-icon'
import ArchiveSearch from './archive-search'
import RandomDiscovery from './random-discovery'
import { publicPool } from '../lib/public-db'
import './reference-home.css'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type Record = { entity_id: string; body: string; version: number }
const domains = [
  { name:'Science', icon:'atom' },{ name:'Technology',icon:'cpu' },
  { name:'Humanities',icon:'book' },{ name:'Philosophy',icon:'pillar' },
  { name:'History',icon:'landmark' },{ name:'Society',icon:'globe' },
  { name:'Economics',icon:'chart' },{ name:'Health',icon:'heart' },
  { name:'Life',icon:'leaf' },{ name:'Space',icon:'planet' },
  { name:'Earth',icon:'mountain' },{ name:'Arts & Culture',icon:'grid' },
]
const navigation = [
  {label:'Explore',icon:'compass',href:'#explore'},
  {label:'Categories',icon:'grid',href:'#domains'},
  {label:'Timeline',icon:'timeline',href:'#today'},
  {label:'Books',icon:'book'},
  {label:'Papers',icon:'paper'},
  {label:'People',icon:'people'},
  {label:'Topics',icon:'tag',href:'#domains'},
  {label:'Random',icon:'dice',href:'#random'},
  {label:'Latest Revisions',icon:'clock',href:'#verified'},
]
const journeys = [
  {title:'The Path of AI',subtitle:'From ideas to intelligence and a changing world.',
    image:'journey-ai',topic:'Science'},
  {title:'The Rise and Fall of Civilizations',
    subtitle:'Patterns, people, and forces across history.',
    image:'journey-civilization',topic:'History'},
  {title:'The Question of a Good Life',
    subtitle:'An interdisciplinary journey through philosophy.',
    image:'journey-life',topic:'Philosophy'},
]
const crossovers=[
  ['AI & Society','cpu'],['History & Technology','timeline'],
  ['Mind & Consciousness','atom'],['Nature & Humanity','leaf'],
  ['Ethics & the Future','globe'],
]

export default async function Home() {
  // Only a restricted read-only PostgreSQL role and public head projection.
  // No Payload draft, submitted source, rejection or reviewer metadata is read.
  const res=await publicPool().query(
    "SELECT entity_id,body,version FROM kg.public_entries WHERE locale='en' ORDER BY entity_id DESC LIMIT 6"
  )
  const approved=res.rows as Record[]
  // Random choice only among independently approved public entries.
  const randomApproved=approved.length ? approved[Math.floor(Math.random()*approved.length)] : null
  const date=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',
    timeZone:'UTC'}).format(new Date())

  return <div className="reference-home" id="top">
    <header className="ref-header" aria-label="Site header">
      <a href="#top" className="ref-brand" aria-label="DECHIVE.WIKI home">
        <ArchiveIcon name="library" size={30}/>
        <span>DECHIVE.WIKI</span>
      </a>
      <div className="ref-header-split" aria-hidden="true"/>
      <nav className="ref-nav" aria-label="Main navigation">
        {navigation.map(item=>item.href?
          <a key={item.label} href={item.href}
            className={item.label==='Explore'?'ref-nav-active':''}>
            <ArchiveIcon name={item.icon} size={20}/>{item.label}
          </a>:
          <span key={item.label} className="ref-nav-disabled" aria-disabled="true"
            title="This section is not available in the current preview">
            <ArchiveIcon name={item.icon} size={20}/>{item.label}
          </span>
        )}
      </nav>
      <div className="ref-header-split ref-header-split-right" aria-hidden="true"/>
      <div className="ref-tools" aria-label="Additional features in development">
        <span title="Bookmarks: not yet available"><ArchiveIcon name="bookmark" size={21}/></span>
        <span title="Notifications: not yet available"><ArchiveIcon name="bell" size={21}/></span>
        <span title="Account: staff-only access in this preview"><ArchiveIcon name="user" size={21}/></span>
      </div>
    </header>

    <section className="ref-hero" aria-labelledby="reference-title">
      <div className="ref-hero-landscape" aria-hidden="true"/>
      <div className="ref-hero-content">
        <h1 id="reference-title">DECHIVE.WIKI</h1>
        <div className="ref-hero-tagline">
          <span aria-hidden="true" className="ref-rule"/>
          <p>One Archive. Infinite Connections.</p>
          <span aria-hidden="true" className="ref-rule"/>
        </div>
        <p className="ref-visually-hidden">The Living Knowledge Archive</p>
        <ArchiveSearch records={approved}/>
      </div>
    </section>

    <section className="ref-domain-strip" id="domains" aria-label="12 Knowledge Domains">
      <div className="ref-domains-label">
        <strong>12 Knowledge<br/>Domains</strong>
        <ArchiveIcon name="arrow" size={17}/>
      </div>
      <div className="ref-domains-scroll">
        {domains.map(d=><span key={d.name} className="ref-domain" aria-disabled="true"
          title="Domain pages are not yet available in this design preview">
          <ArchiveIcon name={d.icon} size={31}/>
          <span>{d.name}</span>
        </span>)}
      </div>
    </section>

    <main className="ref-main">
      <div className="ref-feature-grid">
        <section className="ref-knowledge-trail" aria-labelledby="knowledge-web-title">
          <div className="ref-trail-image" aria-hidden="true"/>
          <div className="ref-trail-content">
            <span className="ref-trail-kicker">CONNECTED KNOWLEDGE TRAIL</span>
            <h2 id="knowledge-web-title">The Web of Knowledge</h2>
            <p>Follow living connections across ideas, people, events, and discoveries —
              from AI to history, from philosophy to the future.</p>
            <a href="#journeys" className="ref-light-cta">
              Explore the Trail <ArchiveIcon name="arrow" size={17}/>
            </a>
          </div>
          <p className="ref-trail-caption">Illustrative pathways, not verified publications.</p>
        </section>

        <section className="ref-today ref-panel" id="today" aria-labelledby="today-title">
          <div className="ref-panel-head">
            <h2 id="today-title"><ArchiveIcon name="calendar" size={24}/>Today in the Archive</h2>
            <span className="ref-date">{date} · UTC</span>
          </div>
          <div className="ref-today-story">
            <div className="ref-colosseum" role="img" aria-label="Illustrative photograph of the Roman Colosseum"/>
            <div className="ref-today-story-text">
              <span className="ref-eyebrow">ON THIS DAY · AWAITING REVIEW</span>
              <h3>History worth revisiting.</h3>
              <p>Historical entries will appear after their dates, sources, and claims have been reviewed.</p>
            </div>
          </div>
          <div className="ref-today-links">
            <p><ArchiveIcon name="leaf" size={16}/><strong>In Science</strong><span>Verified discoveries will appear here</span></p>
            <p><ArchiveIcon name="book" size={16}/><strong>In Ideas</strong><span>Evidence-based milestones belong here</span></p>
            <p><ArchiveIcon name="people" size={16}/><strong>In People</strong><span>Reviewed biographies will appear here</span></p>
          </div>
        </section>
      </div>

      <div className="ref-content-grid">
        <section className="ref-journeys" id="journeys" aria-labelledby="journeys-title">
          <div className="ref-section-head">
            <h2 id="journeys-title"><ArchiveIcon name="nodes" size={23}/>
              Featured Knowledge Journeys</h2>
            <span className="ref-section-note">Illustrative journeys</span>
          </div>
          <div className="ref-journey-grid">
            {journeys.map(j=><article className={'ref-journey ref-'+j.image} key={j.title}>
              <div className="ref-journey-photo" aria-hidden="true"/>
              <div className="ref-journey-bottom">
                <h3>{j.title}</h3>
                <p>{j.subtitle}</p>
              </div>
              <span className="ref-journey-example">Design example</span>
            </article>)}
          </div>
        </section>

        <section className="ref-verified ref-panel" id="verified" aria-labelledby="verified-title">
          <div className="ref-panel-head">
            <h2 id="verified-title"><ArchiveIcon name="verify" size={23}/>New &amp; Verified</h2>
            <span className="ref-panel-note">Approved public records</span>
          </div>
          <div className="ref-verified-list">
            {approved.length ? approved.slice(0,3).map((r,i)=>
              <a className="ref-verified-row" href={'/knowledge/'+r.entity_id} key={r.entity_id}>
                <span className={'ref-thumb ref-thumb-'+i} aria-hidden="true"><ArchiveIcon name="book" size={22}/></span>
                <span className="ref-verified-description">
                  <strong>{r.body.slice(0,65)}{r.body.length>65?'…':''}</strong>
                  <small>Approved public revision · Version {r.version}</small>
                </span>
                <ArchiveIcon name="arrow" size={15}/>
              </a>) :
              <div className="ref-verified-empty">
                <ArchiveIcon name="verify" size={30}/>
                <strong>No public records yet.</strong>
                <p>This list appears only after independent review and publication.</p>
              </div>}
          </div>
        </section>

        <RandomDiscovery records={approved} initialId={randomApproved?.entity_id ?? null}/>
      </div>

      <section className="ref-crossroads" aria-labelledby="crossroads-title">
        <h2 id="crossroads-title"><ArchiveIcon name="layers" size={28}/>
          From AI to History to Philosophy</h2>
        <p>Explore across domains, follow unexpected links,<br/>and discover how ideas connect.</p>
        <div className="ref-crossroads-items">
          {crossovers.map(([label,icon])=><a href="#domains" key={label}>
            <ArchiveIcon name={icon} size={28}/>
            <span>{label}</span>
            <ArchiveIcon name="arrow" size={15}/>
          </a>)}
        </div>
      </section>
    </main>
    <footer className="ref-footer">
      <strong>DECHIVE.WIKI</strong>
      <span>An independent archive. No unreviewed submissions are shown as facts.</span>
      <span>English edition / Isolated design preview</span>
    </footer>
  </div>
}
