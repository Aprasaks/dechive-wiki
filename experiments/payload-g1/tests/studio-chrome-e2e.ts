import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
import { getPayload } from 'payload'
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
  if(kind==='reviewer')await check('Reviewer reads draft but has no editor form in Chrome',async()=>{
    await p.getByRole('heading',{name:'Review queue'}).waitFor()
    await p.getByText(title).waitFor({timeout:15000})
    assert.equal(await p.getByRole('button',{name:'Save private draft'}).count(),0)
    await p.screenshot({path:'artifacts/studio-reviewer.png',fullPage:true})
  })
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
