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
   case 'image': return <span key={i}>{t.text||'Image unavailable'}</span>
   default: return <React.Fragment key={i}>{t.raw||t.text||''}</React.Fragment>
  }
 })
}
export function articleHeadings(body:string) {
 return (marked.lexer(body,{gfm:true}) as Token[])
  .filter(t=>t.type==='heading' && (t.depth===1 || t.depth===2))
  .map((t,i)=>({id:'section-'+(i+1),text:t.text||''}))
}
function blocks(tokens:Token[]):ReactNode[] {
 let headingIndex=0
 return tokens.map((t,i)=>{
  switch(t.type){
   case 'space': return null
   case 'heading': { const children=inline(t.tokens); const id=t.depth===1||t.depth===2?'section-'+(++headingIndex):undefined; switch(t.depth){case 1:return <h2 id={id} key={i}>{children}</h2>;case 2:return <h2 id={id} key={i}>{children}</h2>;case 3:return <h3 key={i}>{children}</h3>;default:return <h4 key={i}>{children}</h4>} }
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
export function ArticleBody({body}:{body:string}) {
 return <div className="reading-body" data-testid="public-approved-body">{blocks(marked.lexer(body,{gfm:true}) as Token[])}</div>
}
