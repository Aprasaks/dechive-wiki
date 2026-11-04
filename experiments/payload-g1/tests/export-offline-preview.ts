import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Browser } from 'playwright-core'

const ASSETS = [
  'hero-landscape-v2.webp','trail-network-v2.webp','journey-ai.webp','journey-civilization.webp',
  'journey-life.webp','colosseum.webp','maya.webp'
]

// No live staff, passwords, private drafts, or remote resources are bundled.
// The HTML and stylesheet come from the ACTUAL rendered Next.js homepage.
export async function exportOfflinePreview(browser: Browser, base: string, output: string) {
  await mkdir(path.join(output, 'reference'), { recursive: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    const page = await context.newPage()
    const response = await page.goto(base + '/', { waitUntil: 'networkidle' })
    assert.equal(response?.status(), 200)
    await page.locator('form[data-search-ready="true"]').waitFor({ timeout: 15000 })

    const snapshot = await page.evaluate(() => {
      const stylesheet = Array.from(document.styleSheets)
        .map(sheet => {
          try { return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n') }
          catch { return '' }
        }).join('\n')
      const root = document.documentElement.cloneNode(true) as HTMLElement
      root.querySelectorAll('script, iframe, link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"], noscript')
        .forEach(element => element.remove())
      // The source CI may have synthetic approved fixtures from earlier DB tests.
      // Never ship those fixtures as if they were real published knowledge.
      const verified = root.querySelector('.ref-verified-list')
      if (verified) verified.innerHTML =
        '<div class="ref-verified-empty"><strong>No public records in this offline preview.</strong>' +
        '<p>The real archive only displays independently reviewed and published entries.</p></div>'
      const random = root.querySelector('.ref-random-content')
      if (random) random.innerHTML =
        '<h3>Discover the unexpected.</h3>' +
        '<p>Live random discovery requires approved public records.</p>'
      const randomButton = root.querySelector('.ref-random-refresh')
      if (randomButton) {
        randomButton.setAttribute('disabled', '')
        randomButton.setAttribute('title', 'No approved records are included in this offline preview')
      }
      root.querySelectorAll<HTMLAnchorElement>('a[href^="/knowledge/"]')
        .forEach(link => { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true') })
      const search = root.querySelector<HTMLInputElement>('#archive-search')
      if (search) { search.removeAttribute('disabled'); search.setAttribute('value', '') }
      root.querySelectorAll<HTMLButtonElement>('.r-search button, .r-suggestions button')
        .forEach(button => button.removeAttribute('disabled'))
      const form = root.querySelector('.r-search')
      if (form) form.setAttribute('data-search-ready', 'true')
      const oldResults = root.querySelector('.r-search-results')
      if (oldResults) oldResults.remove()
      const head = root.querySelector('head')
      const css = document.createElement('style')
      css.textContent = stylesheet.replaceAll('/reference/', './reference/') +
        '\nbody{margin:0} .offline-flag{position:fixed;bottom:12px;right:12px;' +
        'z-index:999;padding:7px 12px;border-radius:20px;background:#153729;' +
        'color:#fff;font:12px system-ui,sans-serif;box-shadow:0 2px 10px #0003}' +
        '@media(max-width:400px){.offline-flag{font-size:10px;bottom:5px;right:5px}}'
      head?.appendChild(css)
      const flag = document.createElement('aside')
      flag.className = 'offline-flag'
      flag.textContent = 'OFFLINE DESIGN REVIEW · No live data'
      root.querySelector('body')?.appendChild(flag)
      const script = document.createElement('script')
      script.setAttribute('src', './preview.js')
      script.setAttribute('defer', '')
      root.querySelector('body')?.appendChild(script)
      return { html: '<!doctype html>\n' + root.outerHTML, cssLength: stylesheet.length }
    })
    assert.ok(snapshot.cssLength > 10000, 'Rendered Next.js stylesheets were not captured')
    assert.ok(snapshot.html.includes('reference-home'))
    assert.ok(!snapshot.html.includes('/_next/static/'), 'Static preview must not depend on Next assets')
    await writeFile(path.join(output, 'index.html'), snapshot.html, 'utf8')
  } finally {
    await context.close()
  }
  const reference = path.resolve('public/reference')
  for (const name of ASSETS) {
    await copyFile(path.join(reference, name), path.join(output, 'reference', name))
  }
  // This tiny script handles only UX already visible in the approved homepage.
  // It does not simulate authenticated knowledge, verified sources or publication.
  const behavior = String.raw`(() => {
  'use strict';
  const form = document.querySelector('.r-search');
  const input = document.querySelector('#archive-search');
  const area = document.querySelector('.r-search-area');
  if (!form || !input || !area) return;
  let result = null;
  function close() { result?.remove(); result = null; }
  function show() {
    close();
    const panel = document.createElement('div');
    panel.className = 'r-search-results';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    const header = document.createElement('div');
    header.className = 'r-results-top';
    const title = document.createElement('strong');
    title.textContent = 'Offline design preview';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Close ×';
    button.setAttribute('aria-label', 'Close search results');
    button.addEventListener('click', close);
    header.append(title, button);
    const message = document.createElement('p');
    message.textContent = input.value.trim()
      ? 'Search interface test for “' + input.value.trim() + '”. Verified results require the live read-only archive.'
      : 'Type a topic to test the search interface. This file has no connected knowledge database.';
    panel.append(header, message);
    area.append(panel);
    result = panel;
  }
  form.addEventListener('submit', e => { e.preventDefault(); show(); });
  document.querySelectorAll('.r-suggestions button').forEach(chip => {
    chip.addEventListener('click', () => { input.value = chip.textContent || ''; show(); input.focus(); });
  });
  input.addEventListener('input', close);
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); input.focus();
    }
    if (e.key === 'Escape') close();
  });
})();
/* DOMAIN_ARROWS_START */
(() => {
  const controls=document.querySelector('.ref-domain-controls');
  if(!controls)return;
  const list=controls.querySelector('.ref-domains-scroll');
  const prev=controls.querySelector('.ref-domain-prev');
  const next=controls.querySelector('.ref-domain-next');
  if(!list||!prev||!next)return;
  function update(){
    controls.dataset.overflow=String(list.scrollWidth>list.clientWidth+1);
    prev.disabled=list.scrollLeft<=2;
    next.disabled=list.scrollLeft+list.clientWidth>=list.scrollWidth-2;
  }
  function move(direction){list.scrollBy({left:direction*Math.max(156,list.clientWidth*.75),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  prev.addEventListener('click',()=>move(-1));
  next.addEventListener('click',()=>move(1));
  list.addEventListener('scroll',update,{passive:true});
  const observer=new ResizeObserver(update);observer.observe(list);observer.observe(controls);
  update();
})();
/* DOMAIN_ARROWS_END */
`
  await writeFile(path.join(output, 'preview.js'), behavior, 'utf8')
}
