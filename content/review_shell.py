"""Shared offline review chrome. Account controls never collect credentials."""
import base64
import hashlib
from pathlib import Path

ROOT=Path(__file__).resolve().parent

def icon(name):
    paths={
        'search':'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
        'saved':'<path d="M6 3h12v18l-6-4-6 4Z"/>',
        'user':'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
        'share':'<path d="M12 16V2m-5 5 5-5 5 5M5 12v9h14v-9"/>',
    }
    return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">'+paths[name]+'</svg>'

def header():
    nav=[('Explore','https://dechive.wiki/#explore'),('Categories','domain-history.html'),
         ('Timeline','https://dechive.wiki/#today'),('Books',None),('Papers',None),('People',None),
         ('Topics','https://dechive.wiki/#domains'),('Random','https://dechive.wiki/#random'),
         ('Latest Revisions','https://dechive.wiki/#verified')]
    links=[]
    for label,url in nav:
        if url:
            extra=' target="_blank" rel="noopener noreferrer"' if url.startswith('https:') else ''
            links.append('<a href="'+url+'"'+extra+'>'+label+'</a>')
        else:
            links.append('<button type="button" data-review-panel="collection" data-label="'+label+'">'+label+'</button>')
    tools=''.join('<button type="button" data-review-panel="'+panel+'">'+icon(sym)+'<span>'+label+'</span></button>' for panel,sym,label in [('search','search','Search'),('saved','saved','Saved'),('account','user','Sign in')])
    return '''<header class="site-header"><div class="header-top"><a class="wordmark" href="https://dechive.wiki/" target="_blank" rel="noopener noreferrer" aria-label="Open DECHIVE.WIKI homepage in a new tab"><svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 2 29 9v14l-13 7L3 23V9Z M3 9l13 7 13-7 M16 16v14 M9 5l13 7"/></svg>DECHIVE.WIKI</a><div class="header-tools">'''+tools+'''</div></div><nav class="site-nav" aria-label="Main navigation">'''+''.join(links)+'''</nav></header>'''

def actions():
    return '<div class="article-actions"><button type="button" data-review-panel="saved">'+icon('saved')+'Save</button><button type="button" data-review-panel="share">'+icon('share')+'Share</button><small>Unpublished preview</small></div>'

def script():
    return (ROOT/'review_shell.js').read_text(encoding='utf-8')

def csp():
    digest=base64.b64encode(hashlib.sha256(script().encode()).digest()).decode()
    return "default-src 'none'; script-src 'sha256-"+digest+"'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"

def panels():
    return '''<dialog id="review-panel" aria-labelledby="panel-title"><div class="panel-top"><h2 id="panel-title">Review tools</h2><button type="button" id="close-panel" aria-label="Close panel">×</button></div><div id="panel-message"></div><div id="review-search" hidden><label for="review-query">Search this review bundle</label><input id="review-query" type="search" placeholder="Search Pompeii or History…" autocomplete="off"><div id="review-results" role="status" aria-live="polite"></div></div><p class="panel-foot">Offline preview · No account or public article connection</p></dialog><noscript><p class="notice">Review tools require JavaScript. The article, contents and navigation links remain readable.</p></noscript><script>'''+script()+'''</script>'''
