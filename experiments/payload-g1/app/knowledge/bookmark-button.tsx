'use client'
import {useEffect,useState} from 'react'
export default function BookmarkButton({entityId}:{entityId:string}){
 const [saved,setSaved]=useState(false),[signedIn,setSignedIn]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>{fetch('/api/member/bookmarks',{cache:'no-store'}).then(async r=>{if(r.status===401){setSignedIn(false);return}if(!r.ok)throw Error();const data=await r.json();setSignedIn(true);setSaved(data.bookmarks.some((x:{entity_id:string})=>x.entity_id===entityId))}).catch(()=>setMessage('Could not load saved status.'))},[entityId])
 async function toggle(){if(!signedIn){window.location.assign('/member');return}setBusy(true);setMessage('');try{const r=await fetch('/api/member/bookmarks',{method:saved?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entityId})});if(!r.ok)throw Error();setSaved(!saved);setMessage(saved?'Removed from saved articles.':'Saved to your archive.')}catch{setMessage('Could not update your bookmark. Please try again.')}finally{setBusy(false)}}
 return <div className="reading-share"><button type="button" disabled={busy||signedIn===null} onClick={()=>void toggle()} aria-pressed={saved}>{saved?'Saved ✓':'Save article'}</button><span role="status">{message}</span></div>
}
