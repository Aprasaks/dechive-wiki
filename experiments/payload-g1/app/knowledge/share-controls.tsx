'use client'

import {useState} from 'react'

// Only render this component for the public, approved article route.
// The link deliberately contains no preview tokens, query string or staff URL.
export default function ShareControls({entryId,title}:{entryId:string;title:string}){
 const [url,setUrl]=useState('')
 const [fallback,setFallback]=useState(false)
 const [message,setMessage]=useState('')
 function publicUrl(){return new URL('/knowledge/'+entryId,window.location.origin).href}

 async function copy(){
  const link=publicUrl()
  setUrl(link)
  setMessage('')
  try{
   if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable')
   await navigator.clipboard.writeText(link)
   setFallback(false)
   setMessage('Link copied.')
  }catch{
   setFallback(true)
   setMessage('Automatic copying is unavailable. Select and copy the link below.')
  }
 }

 async function share(){
  const link=publicUrl()
  setUrl(link)
  setMessage('')
  if(!navigator.share){
   setFallback(true)
   setMessage('Use the link below to share this article.')
   return
  }
  try{
   await navigator.share({title,url:link})
   // A resolved native sheet does not prove a destination published anything.
  }catch(error){
   if(error instanceof DOMException && error.name==='AbortError')return
   setFallback(true)
   setMessage('The share menu is unavailable. Use the link below instead.')
  }
 }

 return <div className="reading-share" aria-label="Share this published article">
  <button type="button" onClick={()=>void copy()}>Copy link</button>
  <button type="button" onClick={()=>void share()}>Share article</button>
  <span className="reading-share-status" role="status" aria-live="polite">{message}</span>
  {fallback&&<div className="reading-share-fallback">
   <label htmlFor="public-article-share-link">Public article link</label>
   <input id="public-article-share-link" type="text" readOnly value={url}
    onFocus={e=>e.currentTarget.select()} onClick={e=>e.currentTarget.select()}/>
  </div>}
 </div>
}
