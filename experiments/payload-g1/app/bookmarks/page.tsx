'use client'
import {useEffect,useState} from 'react'
type Saved={entity_id:string;title:string;summary:string}
export default function BookmarksPage(){
 const [items,setItems]=useState<Saved[]>([]),[state,setState]=useState('Loading your saved articles…')
 useEffect(()=>{fetch('/api/member/bookmarks',{cache:'no-store'}).then(async r=>{if(r.status===401){setState('Sign in to see your saved articles.');return}if(!r.ok)throw Error();const data=await r.json();setItems(data.bookmarks);setState(data.bookmarks.length?'':'You have not saved any articles yet.')}).catch(()=>setState('Could not load your saved articles. Please try again.'))},[])
 async function remove(id:string){const r=await fetch('/api/member/bookmarks',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({entityId:id})});if(r.ok){setItems(prev=>prev.filter(x=>x.entity_id!==id));setState('Article removed.')}else setState('Could not remove this article. Please try again.')}
 return <main className="member-area"><h1>Your saved articles</h1>{state&&<p role="status">{state}</p>}{state.startsWith('Sign in')&&<a href="/member">Sign in</a>}<ul>{items.map(item=><li key={item.entity_id}><a href={'/knowledge/'+item.entity_id}>{item.title}</a><p>{item.summary}</p><button type="button" onClick={()=>void remove(item.entity_id)}>Remove</button></li>)}</ul></main>
}
