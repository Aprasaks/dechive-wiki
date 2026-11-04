import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
import { Pool } from 'pg'
import { getPayload } from 'payload'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { exportOfflinePreview } from './export-offline-preview.ts'
import config from '../native-auth.config.ts'

const BASE='http://127.0.0.1:3112', EVIL='http://127.0.0.1:3113'
const timer=setTimeout(()=>{console.error('G1_CHROME_WATCHDOG');process.exit(124)},180000)
let checks=0, log=''
async function check(name:string, fn:()=>Promise<void>){await fn();++checks;console.log('PASS / '+name)}
const staff=['editor','other','reviewer','publisher'].map(kind=>({
  kind,role:kind==='other'?'editor':kind,
  email:'chrome-'+kind+'-'+randomUUID().slice(0,8)+'@example.invalid',
  password:randomBytes(20).toString('hex')
}))
const payload=await getPayload({config})
for(const a of staff) await payload.create({collection:'staff',overrideAccess:true,
  data:{email:a.email,password:a.password,role:a.role}})
if(payload.db?.destroy)await Promise.race([payload.db.destroy(),new Promise(r=>setTimeout(r,4000))])
const next=spawn(process.execPath,['./node_modules/next/dist/bin/next','dev','--webpack',
  '--hostname','127.0.0.1','--port','3112'],{cwd:process.cwd(),
  env:{...process.env,NODE_ENV:'development',G1_TRUSTED_ORIGIN:BASE,
    G1_COOKIE_SECURE:'false',NEXT_TELEMETRY_DISABLED:'1'},
  stdio:['ignore','pipe','pipe'],detached:true})
next.stdout.on('data',(v:Buffer)=>{log=(log+v.toString()).slice(-9000)})
next.stderr.on('data',(v:Buffer)=>{log=(log+v.toString()).slice(-9000)})
const evil=createServer((_req,res)=>{
 res.writeHead(200,{'Content-Type':'text/html'})
 res.end('<form method="POST" action="'+BASE+
  '/api/editorial-drafts?draft=true"><input name="title" value="ATTACK"/>'+
  '<button type="submit">Cross-site post</button></form>')
})
await new Promise<void>((resolve,reject)=>{evil.once('error',reject);evil.listen(3113,'127.0.0.1',resolve)})
async function ready(){
 const deadline=Date.now()+60000
 while(Date.now()<deadline){
  if(next.exitCode!==null)throw Error(log.slice(-3000))
  try{if((await fetch(BASE+'/studio/login',{signal:AbortSignal.timeout(1500)})).status===200)return}catch{}
  await new Promise(r=>setTimeout(r,1000))
 }
 throw Error('Next server timeout: '+log.slice(-4000))
}
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined
try{
 await ready()
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
   headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
 console.log('CHROME_VERSION '+browser.version())
 await mkdir('artifacts',{recursive:true})
 await check('Reference desktop homepage matches the supplied encyclopedic layout sections', async()=>{
  const context=await browser!.newContext({viewport:{width:1672,height:941}})
  try{
    const p=await context.newPage()
    const r=await p.goto(BASE+'/',{waitUntil:'networkidle'})
    assert.equal(r?.status(),200)
    await p.getByRole('heading',{name:'DECHIVE.WIKI',level:1}).waitFor()
    assert.equal(await p.locator('input#archive-search').count(),1)
    for(const title of ['The Web of Knowledge','Today in the Archive',
      'Featured Knowledge Journeys','New & Verified','Random Discovery',
      'From AI to History to Philosophy']){
      assert.equal(await p.getByRole('heading',{name:title}).count(),1,title)
    }
    assert.equal(await p.locator('.ref-domain').count(),12)
    assert.equal(await p.locator('.ref-domain[aria-disabled="true"]').count(),12)
    assert.equal(await p.locator('.ref-domains-scroll a').count(),0,
      'Unbuilt category pages must not masquerade as working links')
    assert.equal(await p.locator('.ref-journey').count(),3)
    assert.equal(await p.locator('.ref-nav > *').count(),9)
    await p.locator('form[data-search-ready="true"]').waitFor({timeout:15000})
    await p.locator('#archive-search').blur()
    await p.keyboard.press('Meta+k')
    assert.equal(await p.evaluate(()=>document.activeElement?.id),'archive-search',
      'Visible keyboard shortcut must actually focus search')
    const wide=await p.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}))
    assert.ok(wide.scroll <= wide.viewport + 2,JSON.stringify(wide))
    await p.screenshot({path:'artifacts/reference-home-desktop-1672.png',fullPage:true})
  }finally{await context.close()}
 })
 await check('Reference images are local optimized WebP assets, with no third-party request dependencies',async()=>{
   for(const name of ['hero','trail','journey-ai','journey-civilization','journey-life','colosseum','maya']){
     const res=await fetch(BASE+'/reference/'+name+'.webp',{signal:AbortSignal.timeout(8000)})
     assert.equal(res.status,200,name+': '+res.status)
     assert.match(res.headers.get('content-type')??'',/image\/webp/)
     assert.ok(Number(res.headers.get('content-length')??0)>3000,name)
   }
 })
 await check('Reference homepage submits to the full approved public search',async()=>{
   const context=await browser!.newContext({viewport:{width:1672,height:941}})
   try{
     const p=await context.newPage()
     await p.goto(BASE+'/',{waitUntil:'domcontentloaded'})
     await p.locator('form[data-search-ready="true"]').waitFor({timeout:15000})
     await p.getByPlaceholder('Search anything in the archive...').fill('xyz-missing-archive-record-2026')
     await p.getByRole('button',{name:'Search',exact:true}).click()
     await p.getByText(/No approved records matching/).waitFor({timeout:12000})
     assert.ok(!(await p.locator('body').innerText()).includes('PRIVATE CHROME FIXTURE'))
   }finally{await context.close()}
 })

 await check('Real browser follows full public search into a revision and its claim sources',async()=>{
  const db=new Pool({connectionString:process.env.PUBLIC_DATABASE_URL})
  const context=await browser!.newContext({viewport:{width:1440,height:1000}})
  try{
   const row=(await db.query("SELECT p.entity_id,p.body FROM kg.public_entries p WHERE p.body LIKE 'SYNTHETIC TEST ONLY reading-%' AND EXISTS(SELECT 1 FROM kg.public_claim_sources e WHERE e.entity_id=p.entity_id AND e.revision_id=p.revision_id) ORDER BY p.entity_id LIMIT 1")).rows[0]
   assert.ok(row,'Public reading fixture with revision sources is required')
   const p=await context.newPage()
   await p.goto(BASE+'/',{waitUntil:'networkidle'})
   await p.getByPlaceholder('Search anything in the archive...').fill(row.body)
   await p.getByRole('button',{name:'Search',exact:true}).click()
   await p.waitForURL('**/search?q=*')
   await p.getByRole('link',{name:row.body,exact:true}).click()
   await p.waitForURL('**/knowledge/'+row.entity_id)
   await p.getByRole('heading',{name:'Claims & sources',exact:true}).waitFor()
   await p.getByRole('link',{name:'Synthetic supporting reference',exact:true}).waitFor()
   assert.ok(!(await p.locator('body').innerText()).includes('PRIVATE REVIEWER'))
   await p.screenshot({path:'artifacts/public-reading-desktop.png',fullPage:true})
   await p.setViewportSize({width:390,height:844})
   const bounds=await p.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}))
   assert.ok(bounds.scroll<=bounds.width+2,JSON.stringify(bounds))
   await p.screenshot({path:'artifacts/public-reading-mobile.png',fullPage:true})
  }finally{await context.close();await db.end()}
 })

 await check('390px mobile reference homepage preserves all sections with no horizontal overflow',async()=>{
   const context=await browser!.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true})
   try{
     const p=await context.newPage()
     const r=await p.goto(BASE+'/',{waitUntil:'networkidle'})
     assert.equal(r?.status(),200)
     await p.getByRole('heading',{name:'DECHIVE.WIKI',level:1}).waitFor()
     const wide=await p.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}))
     assert.ok(wide.scroll <= wide.viewport + 2,JSON.stringify(wide))
     assert.equal(await p.locator('.ref-domain').count(),12)
     await p.screenshot({path:'artifacts/reference-home-mobile-390.png',fullPage:true})
   }finally{await context.close()}
 })

 await check('Real Chrome visual review across laptop, tablet and compact phone',async()=>{
  const views=[
   {name:'laptop-1440',width:1440,height:900},
   {name:'tablet-768',width:768,height:1024},
   {name:'compact-mobile-320',width:320,height:720},
  ] as const
  for(const view of views){
   const context=await browser!.newContext({
    viewport:{width:view.width,height:view.height},deviceScaleFactor:1,
    isMobile:view.width<=390,hasTouch:view.width<=390
   })
   try{
    const p=await context.newPage()
    assert.equal((await p.goto(BASE+'/',{waitUntil:'networkidle'}))?.status(),200)
    await p.getByRole('heading',{name:'DECHIVE.WIKI',level:1}).waitFor()
    assert.equal(await p.locator('.ref-domain').count(),12)
    const size=await p.evaluate(()=>({actual:document.documentElement.scrollWidth,viewport:innerWidth}))
    assert.ok(size.actual<=size.viewport+2,view.name+': '+JSON.stringify(size))
    if(view.width===320){
      const chipsFit=await p.getByRole('button',{name:'Space Exploration'}).evaluate(el=>{
        const item=el.getBoundingClientRect()
        const container=el.parentElement?.getBoundingClientRect()
        return Boolean(container && item.bottom<=container.bottom+1 && item.right<=container.right+1)
      })
      assert.ok(chipsFit,'Smallest phone must show all six example topic chips, without crop')
    }
    await p.screenshot({path:'artifacts/reference-home-'+view.name+'.png',fullPage:true})
   }finally{await context.close()}
  }
  // Offline-only proof gallery. No external assets or executable JS; no deployment.
  const screenshots=[
   ['Desktop · 1672px','reference-home-desktop-1672.png'],
   ['Laptop · 1440px','reference-home-laptop-1440.png'],
   ['Tablet · 768px','reference-home-tablet-768.png'],
   ['Mobile · 390px','reference-home-mobile-390.png'],
   ['Compact Mobile · 320px','reference-home-compact-mobile-320.png']
  ]
  const gallery=screenshots.map(([label,file])=>
   '<figure><a href="'+file+'" target="_blank" rel="noopener">'+
   '<img src="'+file+'" alt="'+label+' screenshot" loading="lazy"></a>'+
   '<figcaption>'+label+' · click to view full size</figcaption></figure>'
  ).join('')
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
   '<meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<title>DECHIVE.WIKI — Screen Review</title><style>'+
   'body{margin:0;background:#f7f8f5;color:#193026;font:15px/1.5 system-ui,sans-serif}'+
   'header{padding:24px max(20px,calc((100vw - 1200px)/2));background:#fff;border-bottom:1px solid #dce2da}'+
   'h1{font:600 32px Georgia,serif;margin:0 0 5px}p{margin:4px 0;color:#516052}'+
   'main{max-width:1200px;margin:auto;padding:24px 18px 60px}'+
   '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:23px}'+
   'figure{min-width:0;margin:0;background:white;padding:12px;border:1px solid #dfe6dc;border-radius:10px}'+
   'figure a{display:block;max-height:650px;overflow:auto;background:#e8ece5;border-radius:6px}'+
   'figure img{display:block;width:100%;height:auto}figcaption{padding:10px 2px 0;color:#526454}'+
   '</style></head><body><header><h1>DECHIVE.WIKI / Screen Review</h1>'+
   '<p>Real browser snapshots of the reference-based homepage · five screen sizes.</p>'+
   '<p>Isolated CI fixture only. Not deployed or populated with real reviewed knowledge.</p>'+
   '<p><a href="offline-preview/index.html">Open clickable offline homepage review</a></p>'+
   '</header><main><div class="grid">'+gallery+'</div></main></body></html>'
  await writeFile('artifacts/index.html',html,'utf8')
 })
 await check('Export same rendered homepage as standalone offline clickable preview with zero network requests',async()=>{
  const output=resolve('artifacts/offline-preview')
  await exportOfflinePreview(browser!,BASE,output)
  const context=await browser!.newContext({viewport:{width:1440,height:900}})
  const page=await context.newPage()
  const remoteRequests:string[]=[]
  page.on('request',request=>{
    if(/^https?:/i.test(request.url())) remoteRequests.push(request.url())
  })
  try{
    const url=pathToFileURL(resolve(output,'index.html')).href
    const response=await page.goto(url,{waitUntil:'load'})
    assert.equal(response?.status(),200)
    await page.getByRole('heading',{name:'DECHIVE.WIKI',level:1}).waitFor()
    assert.equal(await page.locator('.ref-domain').count(),12)
    const img=await page.locator('.ref-trail-image').evaluate(el=>getComputedStyle(el).backgroundImage)
    assert.match(img,/reference\/trail-network-v2\.webp/,'Real local WebP scenic asset was not loaded')
    const input=page.getByPlaceholder('Search anything in the archive...')
    await input.fill('Consciousness')
    await page.getByRole('button',{name:'Search',exact:true}).click()
    await page.getByText('Offline design preview',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Close search results'}).click()
    await page.keyboard.press('Control+k')
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'archive-search')
    await page.getByRole('button',{name:'Space Exploration'}).click()
    await page.getByText(/Search interface test for/).waitFor()
    assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE CHROME FIXTURE'))
    assert.deepEqual(remoteRequests,[],'Preview unexpectedly reached the network')
    await page.screenshot({path:'artifacts/offline-preview-desktop.png',fullPage:true})
  }finally{await context.close()}
  const mobile=await browser!.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  try{
    const page=await mobile.newPage()
    await page.goto(pathToFileURL(resolve(output,'index.html')).href,{waitUntil:'load'})
    const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}))
    assert.ok(width.scroll<=width.viewport+2,JSON.stringify(width))
    assert.equal(await page.locator('.ref-domain').count(),12)
    await page.screenshot({path:'artifacts/offline-preview-mobile.png',fullPage:true})
  }finally{await mobile.close()}
 })
 await check('Random refresh cycles through approved records without exposing private data',async()=>{
  const context=await browser!.newContext({viewport:{width:1440,height:900}})
  try{
   const p=await context.newPage()
   assert.equal((await p.goto(BASE+'/',{waitUntil:'networkidle'}))?.status(),200)
   const button=p.getByRole('button',{name:'Show another approved record'})
   const links=await p.locator('.ref-verified-row').evaluateAll(elements=>
    elements.map(el=>el.getAttribute('href')).filter(Boolean))
   if(links.length>=2){
    assert.equal(await button.isEnabled(),true)
    const before=await p.locator('.ref-random-content a').getAttribute('href')
    await button.click()
    const after=await p.locator('.ref-random-content a').getAttribute('href')
    assert.notEqual(after,before,'refresh should choose a different approved record')
    assert.ok(links.includes(after),'refresh target must be an approved public record')
   }else{
    assert.equal(await button.isDisabled(),true)
   }
   assert.ok(!(await p.locator('body').innerText()).includes('PRIVATE CHROME FIXTURE'))
  }finally{await context.close()}
 })
 const ctx=await browser.newContext({viewport:{width:1440,height:900}})
 const page=await ctx.newPage()
 await check('Chrome guest is redirected from private studio to login',async()=>{
  await page.goto(BASE+'/studio',{waitUntil:'domcontentloaded'})
  assert.ok(page.url().endsWith('/studio/login'),page.url())
  await page.getByRole('heading',{name:'Editorial Sign In'}).waitFor()
  await page.locator('form[data-login-ready="true"]').waitFor({timeout:15000})
 })
 const editor=staff.find(x=>x.kind==='editor')!
 await check('Chrome logs in as editor with a real HttpOnly SameSite Strict cookie',async()=>{
  await page.getByRole('textbox',{name:'Email address'}).fill(editor.email)
  await page.getByLabel('Password').fill(editor.password)
  await page.getByRole('button',{name:'Sign in'}).click()
  await page.getByRole('heading',{name:'Editorial Workspace'}).waitFor({timeout:15000})
  await page.getByRole('heading',{name:'New private draft'}).waitFor()
  await page.locator('[data-studio-ready="true"]').waitFor({timeout:15000})
  const cookies=await ctx.cookies()
  const cookie=cookies.find(c=>c.name.includes('token'))
  assert.ok(cookie,'Payload session cookie absent')
  assert.equal(cookie.httpOnly,true)
  assert.equal(cookie.sameSite,'Strict')
 })
 const title='Chrome proof '+randomUUID().slice(0,8)
 let entityId=''
 let chromeRevisionId=''
 await check('Chrome saves a draft through editor form and updates private list',async()=>{
  await page.getByRole('textbox',{name:'Working title'}).fill(title)
  await page.getByRole('textbox',{name:'Article content'}).fill(
   'PRIVATE CHROME FIXTURE: paper introduced a test idea.')
  const reqPromise=page.waitForRequest(r=>r.method()==='POST'&&r.url().includes('/api/editorial-drafts?draft=true'))
  await page.getByRole('button',{name:'Save private draft'}).click()
  entityId=(await reqPromise).postDataJSON().stableEntityId
  assert.match(entityId,/^[0-9a-f-]{36}$/)
  await page.getByText('Private draft saved.',{exact:false}).waitFor({timeout:15000})
  await page.getByText(title).waitFor({timeout:15000})
  await page.screenshot({path:'artifacts/studio-editor.png',fullPage:true})
 })
 await check('Chrome editor attaches a citation and queues immutable unverified candidate',async()=>{
  await page.getByRole('button',{name:'Attach source & request review'}).first().click()
  await page.getByRole('form',{name:'Source evidence submission'}).waitFor()
  await page.getByRole('textbox',{name:'Source URL'}).fill(
    'https://example.invalid/browser-source-'+randomUUID().slice(0,8))
  await page.getByRole('textbox',{name:'Source description'}).fill(
    'Entirely synthetic browser evidence test; no external source is asserted.')
  await page.getByRole('textbox',{name:'Exact claim from draft'}).fill(
    'paper introduced a test idea')
  await page.getByRole('textbox',{name:'Source pinpoint'}).fill('fixture paragraph 1')
  await page.getByRole('combobox',{name:'Editor license declaration'}).selectOption('unknown')
  await page.screenshot({path:'artifacts/studio-evidence-form.png',fullPage:true})
  await page.getByRole('button',{name:'Queue for independent review'}).click()
  await page.getByText('Evidence submitted for independent review.',{exact:false})
    .waitFor({timeout:15000})
  const text=await page.locator('[role="status"]').innerText()
  assert.match(text,/NOT published/)
  const id=text.match(/Candidate: ([0-9a-f-]{36})/i)
  assert.ok(id,'No candidate identifier returned by UI')
  chromeRevisionId=id[1]
 })
 await check('Draft never appears in the anonymous public knowledge URL',async()=>{
  assert.equal((await ctx.request.get(BASE+'/knowledge/'+entityId)).status(),404)
  assert.ok(!(await (await ctx.request.get(BASE+'/sitemap.xml')).text()).includes(entityId))
 })
 await check('Real Chrome cross-origin malicious HTML form is rejected before write',async()=>{
  await page.goto(EVIL,{waitUntil:'domcontentloaded'})
  const responsePromise=page.waitForResponse(r=>r.url().includes('/api/editorial-drafts?draft=true'))
  await page.getByRole('button',{name:'Cross-site post'}).click()
  const response=await responsePromise
  assert.equal(response.status(),403)
  assert.match(await response.text(),/CSRF_ORIGIN_REJECTED/)
 })
 await check('Chrome sign-out revokes private studio cookie access',async()=>{
  await page.goto(BASE+'/studio',{waitUntil:'domcontentloaded'})
  await page.locator('[data-studio-ready="true"]').waitFor({timeout:15000})
  await page.getByRole('button',{name:'Sign out'}).click()
  await page.getByRole('heading',{name:'Editorial Sign In'}).waitFor({timeout:15000})
  await page.goto(BASE+'/studio',{waitUntil:'domcontentloaded'})
  assert.ok(page.url().endsWith('/studio/login'))
 })
 await ctx.close()
 for(const kind of ['other','reviewer','publisher']){
  const a=staff.find(s=>s.kind===kind)!
  const scope=await browser.newContext({viewport:{width:1440,height:900}})
  const p=await scope.newPage()
  await p.goto(BASE+'/studio/login',{waitUntil:'domcontentloaded'})
  await p.locator('form[data-login-ready="true"]').waitFor({timeout:15000})
  await p.getByRole('textbox',{name:'Email address'}).fill(a.email)
  await p.getByLabel('Password').fill(a.password)
  await p.getByRole('button',{name:'Sign in'}).click()
  await p.getByRole('heading',{name:'Editorial Workspace'}).waitFor({timeout:15000})
  await p.locator('[data-studio-ready="true"]').waitFor({timeout:15000})
  if(kind==='other')await check('Second editor cannot see another editor draft in Chrome',async()=>{
    await p.getByText('No drafts available to your role.').waitFor({timeout:15000})
    assert.ok(!(await p.locator('body').innerText()).includes(title))
  })
  if(kind==='reviewer'){
    await check('Reviewer reads draft but has no editor composer in Chrome',async()=>{
      await p.getByRole('heading',{name:'Independent evidence review'}).waitFor()
      await p.getByText(title).waitFor({timeout:15000})
      assert.equal(await p.getByRole('button',{name:'Save private draft'}).count(),0)
      await p.screenshot({path:'artifacts/studio-reviewer.png',fullPage:true})
    })
    await check('Real Chrome reviewer can inspect and reject the pending source candidate',async()=>{
      const candidate=p.locator('li').filter({hasText:'Candidate '+chromeRevisionId.slice(0,8)}).first()
      await candidate.getByRole('button',{name:'Evaluate this candidate'}).waitFor({timeout:15000})
      await candidate.getByRole('button',{name:'Evaluate this candidate'}).click()
      const note='The source is a synthetic browser fixture and its origin and reuse rights are unverified.'
      await candidate.getByRole('textbox',{name:'Reasoned review note'}).fill(note)
      assert.equal(await candidate.getByRole('button',{name:'Record independent acceptance'}).isDisabled(),true)
      await p.screenshot({path:'artifacts/studio-review-decision-form.png',fullPage:true})
      await candidate.getByRole('button',{name:'Reject candidate'}).click()
      await p.getByText('Candidate rejected.',{exact:false}).waitFor({timeout:15000})
      await candidate.getByText('Decision:').waitFor({timeout:15000})
      assert.match(await candidate.innerText(),/rejected/)
    })
  }
  if(kind==='publisher')await check('Publisher cannot browse drafts or create content in Chrome',async()=>{
    await p.getByRole('heading',{name:'Publication desk'}).waitFor()
    assert.equal(await p.getByRole('button',{name:'Save private draft'}).count(),0)
    assert.ok(!(await p.locator('body').innerText()).includes(title))
  })
  await scope.close()
 }
 console.log('G1_REAL_CHROME_'+checks+'_E2E_CHECKS_SUCCESS')
}catch(e){console.error('CHROME_NEXT_ERROR '+log.slice(-5500));throw e}
finally{
 if(browser)await browser.close()
 await new Promise<void>(resolve=>evil.close(()=>resolve()))
 try{process.kill(-next.pid!,'SIGTERM')}catch{next.kill('SIGTERM')}
 await new Promise<void>(resolve=>{
  const t=setTimeout(()=>{try{process.kill(-next.pid!,'SIGKILL')}catch{};resolve()},4000)
  next.once('exit',()=>{clearTimeout(t);resolve()})
 })
 clearTimeout(timer)
}
process.exit(0)
