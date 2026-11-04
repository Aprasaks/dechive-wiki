import { publicPool } from '../lib/public-db'
import './homepage.css'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type PublicRecord = { entity_id:string; body:string; version:number }

export default async function Home() {
  // The only data the public homepage may load is from the read-only
  // approved-head projection. No Payload draft or reviewer table is queried.
  const result = await publicPool().query(
    'SELECT entity_id, body, version FROM kg.public_entries ' +
    "WHERE locale='en' ORDER BY entity_id DESC LIMIT 6"
  )
  const records = result.rows as PublicRecord[]

  return (
    <div className="dechive-home">
      <div className="dh-microbar">
        <div className="dh-container">
          <span>AN INDEPENDENT, LIVING REFERENCE</span>
          <span>ENGLISH EDITION / ARCHIVE 001</span>
        </div>
      </div>
      <header className="dh-container dh-masthead">
        <a className="dh-brand" href="/" aria-label="DECHIVE.WIKI homepage">
          DECHIVE<span>.WIKI</span>
        </a>
        <nav className="dh-nav" aria-label="Primary navigation">
          <a href="#library">The Library</a>
          <a href="#principle">The Principle</a>
          <a href="#method">Our Method</a>
        </nav>
      </header>

      <div className="dh-container">
        <section className="dh-hero" aria-labelledby="dh-headline">
          <div className="dh-hero-copy">
            <span className="dh-kicker">A REFERENCE THAT KEEPS GROWING / VOL. 01</span>
            <h1 id="dh-headline">The Living Knowledge Archive</h1>
            <p className="dh-lead">
              Knowledge grows when its evidence remains visible.
              Every entry has a question, a source, and a history.
            </p>
            <a href="#library" className="dh-hero-foot">
              <span className="dh-line" aria-hidden="true"/>
              Explore the public records
            </a>
          </div>
          <aside className="dh-visual" aria-label="Evidence relationship diagram">
            <span className="dh-visual-label">ANATOMY OF A VERIFIED ENTRY</span>
            <div className="dh-map">
              <svg role="img" aria-label="A source connects to a claim, review and public record"
                viewBox="0 0 420 390" xmlns="http://www.w3.org/2000/svg">
                <title>Every public entry connects its claims, evidence and review</title>
                <path className="dh-map-line" d="M94 92 L230 164 L326 90 M230 164 L110 288 M230 164 L319 280"/>
                <circle className="dh-map-halo" cx="230" cy="164" r="71"/>
                <circle className="dh-map-halo" cx="230" cy="164" r="106"/>
                <circle className="dh-map-point" cx="94" cy="92" r="13"/>
                <circle className="dh-map-point" cx="326" cy="90" r="13"/>
                <circle className="dh-map-point" cx="230" cy="164" r="20"/>
                <circle className="dh-map-point" cx="110" cy="288" r="13"/>
                <circle className="dh-map-point" cx="319" cy="280" r="13"/>
                <text x="37" y="64">SOURCE</text>
                <text x="284" y="62">QUESTION</text>
                <text x="212" y="170">CLAIM</text>
                <text x="49" y="318">REVIEW</text>
                <text x="272" y="310">RECORD</text>
              </svg>
            </div>
            <div className="dh-visual-foot">
              <span>Connections, not conclusions</span>
              <span>FIG. 001</span>
            </div>
          </aside>
        </section>
      </div>

      <section id="library" className="dh-container dh-library">
        <div className="dh-heading-row">
          <div>
            <span className="dh-section-number">01 / THE PUBLIC CATALOGUE</span>
            <h2>Recently verified</h2>
          </div>
          <p className="dh-aside">Only approved and published records appear here.</p>
        </div>
        <div className="dh-records">
          {records.length ? records.map((record, index) => (
            <article className="dh-record" key={record.entity_id}>
              <span className="dh-record-meta">
                PUBLIC RECORD / {String(index + 1).padStart(2,'0')} / VERSION {record.version}
              </span>
              <h3>{record.body.slice(0,90)}{record.body.length>90?'…':''}</h3>
              <p>
                <a href={'/knowledge/'+record.entity_id}>
                  Open reviewed record
                </a>
              </p>
            </article>
          )) : (
            <div className="dh-empty" role="status">
              <span className="dh-empty-number" aria-hidden="true">0</span>
              <div>
                <h3>Nothing is published without review.</h3>
                <p>The catalogue begins when its first entry has passed the
                  evidence, rights and publication gates. Private drafts,
                  disputed sources and rejected revisions are never listed here.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section id="principle" className="dh-principle">
        <div className="dh-container dh-principle-grid">
          <div>
            <span className="dh-kicker">02 / OUR PRINCIPLE</span>
            <h2>Source is not proof.</h2>
          </div>
          <div>
            <p>Finding a citation is the beginning of verification, not the end.
              A claim must still be read in context, challenged, and reviewed.</p>
            <small>Every published revision should make its limits and
              supporting evidence inspectable. Uncertainty belongs in the record.</small>
          </div>
        </div>
      </section>

      <section id="method" className="dh-container dh-method">
        <span className="dh-section-number">03 / HOW THE ARCHIVE WORKS</span>
        <h2>From question to record</h2>
        <div className="dh-method-grid">
          <div className="dh-step">
            <span>01 — WRITE</span>
            <h3>Begin with a question.</h3>
            <p>Editors write privately. No draft becomes public automatically.</p>
          </div>
          <div className="dh-step">
            <span>02 — TRACE</span>
            <h3>Attach the evidence.</h3>
            <p>Claims, source locations and reuse rights are documented.</p>
          </div>
          <div className="dh-step">
            <span>03 — REVIEW</span>
            <h3>Challenge each claim.</h3>
            <p>Independent reviewers can accept, reject or flag uncertainty.</p>
          </div>
          <div className="dh-step">
            <span>04 — RECORD</span>
            <h3>Publish a version.</h3>
            <p>Only approved immutable knowledge enters the public catalogue.</p>
          </div>
        </div>
      </section>

      <footer className="dh-container dh-footer">
        <strong>DECHIVE.WIKI</strong>
        <span>THE LIVING KNOWLEDGE ARCHIVE<br/>
          ENGLISH-FIRST / INDEPENDENT TEST ENVIRONMENT</span>
      </footer>
    </div>
  )
}
