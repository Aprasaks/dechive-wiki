'use client'

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

export type SearchRecord = { entity_id: string; body: string; version: number }

const suggestions = [
  'Artificial Intelligence',
  'Ancient Civilizations',
  'Consciousness',
  'Climate Change',
  'Meaning of Life',
  'Space Exploration',
]

export default function ArchiveSearch({ records }: { records: SearchRecord[] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(false)
  const [opened, setOpened] = useState(false)
  const matched = searched
    ? records.filter(r => r.body.toLowerCase().includes(query.trim().toLowerCase()))
    : []

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSearched(true)
    setOpened(true)
  }
  function choose(value: string) {
    setQuery(value)
    setSearched(true)
    setOpened(true)
    inputRef.current?.focus()
  }
  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') setOpened(false)
  }

  return (
    <div className="r-search-area" id="explore">
      <form className="r-search" onSubmit={submit} role="search"
        aria-label="Search approved archive records">
        <label className="r-search-icon" htmlFor="archive-search">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" />
          </svg>
        </label>
        <input ref={inputRef} id="archive-search" value={query} onChange={e => {
          setQuery(e.target.value)
          setSearched(false)
        }} onKeyDown={keyDown} placeholder="Search anything in the archive..."
          autoComplete="off" maxLength={120} />
        <kbd className="r-search-shortcut">⌘ K</kbd>
        <button className="r-search-button" type="submit">Search</button>
      </form>
      <div className="r-suggestions" aria-label="Popular example queries">
        <strong>Popular searches:</strong>
        {suggestions.map(s => (
          <button type="button" key={s} onClick={() => choose(s)}>{s}</button>
        ))}
      </div>
      {opened && (
        <div className="r-search-results" role="status" aria-live="polite">
          <div className="r-results-top">
            <strong>Approved records only</strong>
            <button type="button" onClick={() => setOpened(false)}
              aria-label="Close search results">Close ×</button>
          </div>
          {!query.trim()
            ? <p>Enter a question or topic to search the currently loaded public records.</p>
            : !matched.length
              ? <p>No approved records matching “{query}” are available in this early preview.
                Private drafts and unverified claims are never returned.</p>
              : <ul>{matched.map(r => (
                  <li key={r.entity_id}>
                    <a href={'/knowledge/' + r.entity_id}>
                      {r.body.slice(0, 125)}{r.body.length > 125 ? '…' : ''}
                    </a>
                  </li>
                ))}</ul>}
          <small>Preview search checks the latest {records.length} approved records only.
            It does not search unpublished work.</small>
        </div>
      )}
    </div>
  )
}
