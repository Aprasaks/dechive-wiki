'use client'

import {useEffect,useState} from 'react'
import {parseFragment} from 'parse5'

type Media = {file:string;sha256:string;bytes:number;rights_status:string}
export type Snapshot = {manifest:{staged_html_sha256:string;media:Media[];status:string;publication_allowed:boolean};images:{sha256:string;data:string}[]}
type Status = {kind:'loading'} | {kind:'ready';document:string} | {kind:'error'}

const digest = async (bytes:BufferSource) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('')
const encoder = new TextEncoder()
const pathPattern = /^media\/([a-f0-9]{64})\.(webp|png|jpeg)$/
const dataPattern = /^[A-Za-z0-9+/]*={0,2}$/
const allowed=new Set('article section div p h2 h3 h4 strong em small blockquote ul ol li table thead tbody tr th td col colgroup figure figcaption img a'.split(' '))
const escapeHtml=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

// A sealed, read-only inspection view; this never marks a draft as reviewed.
// Scripts, network resources, forms, popups and same-origin access are disabled.
export async function privatePreviewDocument(body:string,snapshot:Snapshot):Promise<string> {
  const m=snapshot?.manifest
  if (!m || m.status!=='unreviewed' || m.publication_allowed!==false || !Array.isArray(m.media) || !Array.isArray(snapshot.images) || m.media.length!==snapshot.images.length || m.media.length>20 || body.length>2_000_000) throw new Error('Invalid snapshot')
  if (await digest(encoder.encode(body))!==m.staged_html_sha256) throw new Error('Article changed since snapshot')
  const images=new Map<string,string>()
  for (const asset of m.media) {
    const match=pathPattern.exec(asset.file)
    if (!match || match[1]!==asset.sha256 || asset.rights_status!=='pending' || images.has(asset.file)) throw new Error('Invalid media record')
    const entry=snapshot.images.filter(x=>x.sha256===asset.sha256)
    if(entry.length!==1 || typeof entry[0].data!=='string' || entry[0].data.length>8_000_000 || !dataPattern.test(entry[0].data)) throw new Error('Invalid media data')
    const binary=atob(entry[0].data)
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0))
    if(bytes.length!==asset.bytes || await digest(bytes)!==asset.sha256) throw new Error('Image changed since snapshot')
    const ok=match[2]==='webp' ? binary.slice(0,4)==='RIFF'&&binary.slice(8,12)==='WEBP' : match[2]==='png' ? binary.slice(0,8)==='\x89PNG\r\n\x1a\n' : binary.slice(0,3)==='\xff\xd8\xff'
    if(!ok)throw new Error('Image type mismatch')
    images.set(asset.file,`data:image/${match[2]};base64,${entry[0].data}`)
  }
  const used=new Set<string>()
  function render(node:any):string {
    if(node.nodeName==='#text')return escapeHtml(node.value||'')
    if(node.nodeName==='#comment')return ''
    if(node.nodeName==='#document-fragment')return (node.childNodes||[]).map(render).join('')
    const tag=node.tagName
    if(!allowed.has(tag))throw new Error('Unsupported article element')
    const attributes:Record<string,string>=Object.fromEntries((node.attrs||[]).map((a:any)=>[a.name,a.value]))
    let attrs=''
    if(attributes.id && /^[a-zA-Z0-9_-]{1,160}$/.test(attributes.id)) attrs+=` id="${escapeHtml(attributes.id)}"`
    if(tag==='img'){
      const image=images.get(attributes.src||'')
      if(!image)throw new Error('Unlisted media reference')
      used.add(attributes.src)
      attrs+=` src="${image}" alt="${escapeHtml(attributes.alt||'')}"`
      return `<img${attrs}>`
    }
    for(const key of ['colspan','rowspan'])if((tag==='td'||tag==='th')&&/^\d{1,2}$/.test(attributes[key]||''))attrs+=` ${key}="${attributes[key]}"`
    if(tag==='th'&&['row','col','rowgroup','colgroup'].includes(attributes.scope))attrs+=` scope="${attributes.scope}"`
    if(tag==='col')return `<col${attrs}>`
    // Links remain non-interactive in the isolated preview.
    return `<${tag}${attrs}>${(node.childNodes||[]).map(render).join('')}</${tag}>`
  }
  const content=render(parseFragment(body))
  if(used.size!==images.size)throw new Error('Unreferenced media')
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><style>body{font:16px/1.7 Georgia,serif;margin:24px;color:#252a24}img{max-width:100%;height:auto}figure{margin:2em 0}figcaption{font:13px/1.5 Arial,sans-serif;color:#555}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #ddd;padding:8px}a{color:#315849;pointer-events:none}pre{white-space:pre-wrap}</style></head><body>${content}</body></html>`
}

export default function PrivateArticlePreview({body,snapshot}:{body:string;snapshot:Snapshot}) {
  const [state,setState]=useState<Status>({kind:'loading'})
  useEffect(()=>{let live=true; setState({kind:'loading'}); privatePreviewDocument(body,snapshot).then(document=>{if(live)setState({kind:'ready',document})}).catch(()=>{if(live)setState({kind:'error'})}); return()=>{live=false}},[body,snapshot])
  if(state.kind==='loading')return <p role="status">Checking private snapshot…</p>
  if(state.kind==='error')return <p role="alert">Preview unavailable: the article or images do not match the saved snapshot.</p>
  return <div><p>Private, unreviewed snapshot. Images and sources still require review.</p><iframe title="Private unreviewed article preview" sandbox="" referrerPolicy="no-referrer" srcDoc={state.document} style={{width:'100%',height:800,border:'1px solid #D7D5CD',background:'#fff'}} /></div>
}
