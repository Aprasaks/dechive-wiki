'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export default function DomainScroller({children}:{children:ReactNode}) {
  const ref=useRef<HTMLDivElement>(null)
  const [state,setState]=useState({overflow:false,start:true,end:true})
  useEffect(()=>{
    const el=ref.current
    if(!el)return
    const update=()=>setState({overflow:el.scrollWidth>el.clientWidth+1,start:el.scrollLeft<=2,end:el.scrollLeft+el.clientWidth>=el.scrollWidth-2})
    const observer=new ResizeObserver(update)
    observer.observe(el)
    if(el.parentElement)observer.observe(el.parentElement)
    el.addEventListener('scroll',update,{passive:true})
    update()
    return()=>{observer.disconnect();el.removeEventListener('scroll',update)}
  },[])
  function move(direction:number){
    const el=ref.current
    if(el)el.scrollBy({left:direction*Math.max(156,el.clientWidth*.75),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})
  }
  return <div className="ref-domain-controls" data-overflow={state.overflow}>
    <button type="button" className="ref-domain-arrow ref-domain-prev" aria-label="Previous knowledge domains" aria-controls="knowledge-domains-scroll" disabled={state.start} onClick={()=>move(-1)}><span aria-hidden="true">‹</span></button>
    <div className="ref-domains-scroll" id="knowledge-domains-scroll" ref={ref} tabIndex={0} role="region" aria-label="Knowledge domains, scroll horizontally">{children}</div>
    <button type="button" className="ref-domain-arrow ref-domain-next" aria-label="Next knowledge domains" aria-controls="knowledge-domains-scroll" disabled={state.end} onClick={()=>move(1)}><span aria-hidden="true">›</span></button>
  </div>
}
