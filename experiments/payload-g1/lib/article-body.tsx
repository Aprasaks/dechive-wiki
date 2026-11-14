import React, { type ReactNode } from 'react'
import { marked } from 'marked'

// Render a deliberately limited subset as React nodes, never raw HTML.
// Images require a revision-bound, rights-reviewed media path (not yet implemented).
type Token = { type:string; raw?:string; text?:string; href?:string; depth?:number; ordered?:boolean; start?:number; items?:Token[]; tokens?:Token[]; header?:Cell[]; rows?:Cell[][]; align?:Array<string|null> }
type Cell = { text:string; tokens?:Token[] }
function safeLink(value:string):string|null {
 if (/^#[A-Za-z0-9_-]+$/.test(value)) return value
 try { const u=new URL(value); return u.protocol==='https:'&&!u.username&&!u.password?u.href:null } catch { return null }
}
function inline(tokens:Token[]|undefined):ReactNode[] {
 return (tokens||[]).map((t,i)=>{
  const children=t.tokens?inline(t.tokens):t.text||''
  switch(t.type){
   case 'text': case 'escape': return <React.Fragment key={i}>{children}</React.Fragment>
   case 'strong': return <strong key={i}>{children}</strong>
   case 'em': return <em key={i}>{children}</em>
   case 'del': return <del key={i}>{children}</del>
   case 'codespan': return <code key={i}>{t.text}</code>
   case 'br': return <br key={i}/>
   case 'link': { const href=safeLink(t.href||''); return href?<a key={i} href={href} rel={href.startsWith('https:')?'noopener noreferrer':undefined}>{children}</a>:<React.Fragment key={i}>{children}</React.Fragment> }
   case 'image': {
    const src=/^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.href||'')?t.href:null
    return src?<img key={i} src={src} alt={t.text||''} loading="lazy"/>:<span key={i}>{t.text||'Image unavailable'}</span>
   }
   default: return <React.Fragment key={i}>{t.raw||t.text||''}</React.Fragment>
  }
 })
}
export function articleHeadings(body:string) {
 return (marked.lexer(body,{gfm:true}) as Token[])
  .filter(t=>t.type==='heading' && (t.depth===1 || t.depth===2))
  .map((t,i)=>({id:'section-'+(i+1),text:t.text||''}))
}
const pompeiiImages:Record<number,{src:string,alt:string,caption:string,href:string}>={
 1:{src:'/reference/pompeii-1.webp',alt:'The Forum of Pompeii, with columns in the foreground and Mount Vesuvius beyond.',caption:'The Forum of Pompeii and Mount Vesuvius, 2021. Photo: Commonists / Wikimedia Commons, CC BY-SA 4.0. Resized.',href:'https://commons.wikimedia.org/wiki/File:Forum_(Pompeii)_and_the_Vesuvio.jpg'},
 5:{src:'/reference/pompeii-2.webp',alt:'Large stepping stones across a paved street in Pompeii.',caption:'A paved street and stepping stones in Pompeii, 2015. Photo: Jebulon / Wikimedia Commons, CC0. Resized.',href:'https://commons.wikimedia.org/wiki/File:Street_chauss%C3%A9e_Pompeii.jpg'},
 12:{src:'/reference/pompeii-3.webp',alt:'An approximately 1875 photograph showing two plaster casts of victims of Pompeii.',caption:'Plaster casts of people from Pompeii, photograph by Giorgio Sommer, c. 1875. The Metropolitan Museum of Art, CC0. Resized.',href:'https://commons.wikimedia.org/wiki/File:-Plaster_Casts_of_Bodies,_Pompeii-_MET_DP262064.jpg'},
}
function blocks(tokens:Token[],entityId?:string):ReactNode[] {
 let headingIndex=0
 return tokens.map((t,i)=>{
  switch(t.type){
   case 'space': return null
   case 'heading': { const children=inline(t.tokens); const id=t.depth===1||t.depth===2?'section-'+(++headingIndex):undefined;
    const image=(t.depth===1||t.depth===2) && entityId==='31ecf978-4412-4de1-a056-2b83c2533372'?pompeiiImages[headingIndex]:undefined
    const heading=t.depth===3?<h3>{children}</h3>:t.depth===1||t.depth===2?<h2 id={id}>{children}</h2>:<h4>{children}</h4>
    return <React.Fragment key={i}>{image && <figure><img src={image.src} alt={image.alt} loading="lazy"/><figcaption>{image.caption} <a href={image.href} target="_blank" rel="noopener noreferrer">Source and licence</a></figcaption></figure>}{heading}</React.Fragment> }
   case 'paragraph': return <p key={i}>{inline(t.tokens)}</p>
   case 'text': return <p key={i}>{t.tokens?inline(t.tokens):t.text}</p>
   case 'blockquote': return <blockquote key={i}>{blocks(t.tokens||[])}</blockquote>
   case 'list': { const items=(t.items||[]).map((item,n)=><li key={n}>{blocks(item.tokens||[])}</li>); return t.ordered?<ol key={i} start={t.start}>{items}</ol>:<ul key={i}>{items}</ul> }
   case 'table': return <div className="reading-table-wrap" key={i}><table><thead><tr>{(t.header||[]).map((cell,n)=><th key={n} scope="col">{inline(cell.tokens)}</th>)}</tr></thead><tbody>{(t.rows||[]).map((row,n)=><tr key={n}>{row.map((cell,j)=><td key={j}>{inline(cell.tokens)}</td>)}</tr>)}</tbody></table></div>
   case 'code': return <pre key={i}><code>{t.text}</code></pre>
   case 'hr': return <hr key={i}/>
   default: return <p key={i}>{t.raw||t.text||''}</p>
  }
 })
}
export function ArticleBody({body,entityId}:{body:string,entityId?:string}) {
 return <div className="reading-body" data-testid="public-approved-body">{blocks(marked.lexer(body,{gfm:true}) as Token[],entityId)}</div>
}
