import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {privatePreviewDocument} from '../app/studio/private-article-preview'
const sha=(s:Buffer|string)=>createHash('sha256').update(s).digest('hex')
const img=Buffer.from('iVBORw0KGgo=', 'base64')
const id=sha(img), path=`media/${id}.png`
const body=`<article><p>Private example</p><figure><img src="${path}" alt="Example"><figcaption>Credit</figcaption></figure></article>`
const snapshot={manifest:{staged_html_sha256:sha(body),status:'unreviewed',publication_allowed:false,media:[{file:path,sha256:id,bytes:img.length,rights_status:'pending'}]},images:[{sha256:id,data:img.toString('base64')}]}
const result=await privatePreviewDocument(body,snapshot)
assert.match(result,/src="data:image\/png;base64,/)
assert.match(result,/default-src 'none'/)
await assert.rejects(privatePreviewDocument(body+' changed',snapshot))
const damaged=structuredClone(snapshot);damaged.images[0].data='AAAA'
await assert.rejects(privatePreviewDocument(body,damaged))
const injected=`<meta http-equiv="refresh" content="0;url=https://example.com">${body}`
const attacker=structuredClone(snapshot);attacker.manifest.staged_html_sha256=sha(injected)
await assert.rejects(privatePreviewDocument(injected,attacker))
console.log('Private preview safety checks passed')
