'use client'
import {useEffect,useRef,useState} from 'react'
export type SearchRecord={entity_id:string;body:string;version:number}
const suggestions=['Artificial Intelligence','Ancient Civilizations','Consciousness','Climate Change','Meaning of Life','Space Exploration']
export default function ArchiveSearch(){
 const inputRef=useRef<HTMLInputElement>(null)
 const [hydrated,setHydrated]=useState(false)
 useEffect(()=>{
  setHydrated(true)
  const shortcut=(e:globalThis.KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();inputRef.current?.focus()}}
  document.addEventListener('keydown',shortcut)
  return()=>document.removeEventListener('keydown',shortcut)
 },[])
 return <div className="r-search-area" id="explore">
  <form className="r-search" action="/search" method="get" data-search-ready={hydrated?'true':'false'} role="search" aria-label="Search approved archive records">
   <label className="r-search-icon" htmlFor="archive-search"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/></svg></label>
   <input ref={inputRef} id="archive-search" name="q" placeholder="Search anything in the archive..." autoComplete="off" maxLength={120} required/>
   <kbd className="r-search-shortcut">⌘ K</kbd>
   <button className="r-search-button" type="submit">Search</button>
  </form>
  <div className="r-suggestions" aria-label="Popular example queries">
   <strong>Try a topic:</strong>
   {suggestions.map(s=><button type="button" key={s} disabled={!hydrated} onClick={()=>window.location.assign('/search?'+new URLSearchParams({q:s}).toString())}>{s}</button>)}
  </div>
 </div>
}
