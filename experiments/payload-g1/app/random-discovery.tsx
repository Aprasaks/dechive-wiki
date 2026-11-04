'use client'

import { useState } from 'react'
import ArchiveIcon from './archive-icon'
import type { SearchRecord } from './archive-search'

type Props = {
  records: SearchRecord[]
  initialId: string | null
}

/**
 * The preview only ever receives approved records from kg.public_entries.
 * This component does not query drafts, candidates, or external services.
 */
export default function RandomDiscovery({ records, initialId }: Props) {
  const [selectedId, setSelectedId] = useState(initialId)
  const current = records.find(record => record.entity_id === selectedId) ?? records[0] ?? null

  function another() {
    if (!current || records.length < 2) return
    const candidates = records.filter(record => record.entity_id !== current.entity_id)
    const next = candidates[Math.floor(Math.random() * candidates.length)]
    setSelectedId(next.entity_id)
  }

  return <section className="ref-random ref-panel" id="random" aria-labelledby="random-title">
    <div className="ref-panel-head">
      <h2 id="random-title"><ArchiveIcon name="dice" size={23}/>Random Discovery</h2>
      <button type="button" className="ref-random-refresh"
        aria-label="Show another approved record"
        title={records.length < 2 ? 'More approved records are needed' : 'Show another approved record'}
        disabled={records.length < 2} onClick={another}>
        <ArchiveIcon name="refresh" size={18}/>
      </button>
    </div>
    <div className="ref-random-landscape" role="img"
      aria-label="Illustrative landscape photograph of ancient temple ruins"/>
    <div className="ref-random-content" aria-live="polite">
      {current ? <>
        <h3>{current.body.slice(0,80)}{current.body.length>80?'…':''}</h3>
        <p>A randomly selected approved record from the current preview.</p>
        <a href={'/knowledge/'+current.entity_id}
          aria-label="Read this approved record"><ArchiveIcon name="arrow" size={18}/></a>
      </> : <>
        <h3>Discover the unexpected.</h3>
        <p>Random reading becomes available with the first approved public record.</p>
      </>}
    </div>
  </section>
}
