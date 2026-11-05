"""Shared offline review chrome. Account controls never collect credentials."""
import base64
import hashlib
from pathlib import Path

ROOT=Path(__file__).resolve().parent

def icon(name):
    paths={
        'search':'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
        'saved':'<path d="M5 3h14v19l-7-5-7 5V3Z"/>',
        'user':'<circle cx="12" cy="8" r="4"/><path d="M4 22v-3c0-4 3-6 8-6s8 2 8 6v3"/>',
        'share':'<path d="M12 16V2m-5 5 5-5 5 5M5 12v9h14v-9"/>',
        'bell':'<path d="M5 18h14l-2-3V9a5 5 0 0 0-10 0v6l-2 3ZM10 21h4"/>',
        'compass':'<circle cx="12" cy="12" r="9"/><path d="m16 8-3 7-5 2 3-7Z"/>',
        'grid':'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        'timeline':'<path d="M4 19V5l8 7 8-7"/><circle cx="4" cy="19" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="5" r="2"/>',
        'book':'<path d="M12 6c-4-3-8-3-10-2v16c4-1 7-.7 10 2 3-2.7 6-3 10-2V4c-2-1-6-1-10 2ZM12 6v16"/>',
        'paper':'<path d="M6 2h9l5 5v15H6V2Z M15 2v6h5M9 12h8M9 16h8"/>',
        'people':'<circle cx="9" cy="8" r="3"/><path d="M2 21v-3c0-4 3-6 7-6s7 2 7 6v3M17 4a3 3 0 0 1 0 6M18 13c3 1 4 3 4 6"/>',
        'tag':'<path d="m21 11-10 10-9-9V3h9l10 8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
        'dice':'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
        'clock':'<circle cx="12" cy="12" r="9"/><path d="M12 6v7l5 3M3 4v5h5"/>',
    }
    return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+paths[name]+'</svg>'

def header():
    nav=[('Explore','compass','https://dechive.wiki/#top'),('Categories','grid','domain-history.html'),
         ('Timeline','timeline','https://dechive.wiki/#today'),('Books','book',None),('Papers','paper',None),('People','people',None),
         ('Topics','tag','https://dechive.wiki/#domains'),('Random','dice','https://dechive.wiki/#random'),
         ('Latest Revisions','clock','https://dechive.wiki/#verified')]
    links=[]
    for label,symbol,url in nav:
        if url:
            extra=''
            links.append('<a href="'+url+'"'+extra+'>'+icon(symbol)+'<span>'+label+'</span></a>')
        else:
            links.append('<button type="button" data-review-panel="collection" data-label="'+label+'">'+icon(symbol)+'<span>'+label+'</span></button>')
    tools=''.join('<button type="button" aria-label="'+label+'" data-review-panel="'+panel+'">'+icon(sym)+'</button>' for panel,sym,label in [('saved','saved','Saved'),('notifications','bell','Notifications'),('account','user','Sign in')])
    return '''<header class="site-header"><div class="header-top"><a class="wordmark" href="https://dechive.wiki/#top" aria-label="DECHIVE.WIKI home"><svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7 12 3l9 4v11l-9 4-9-4V7Z"/><path d="m3 7 9 4 9-4M12 11v11M7 5l10 4"/></svg>DECHIVE.WIKI</a><div class="header-tools">'''+tools+'''</div></div><nav class="site-nav" aria-label="Main navigation">'''+''.join(links)+'''</nav></header>'''

def actions():
    return '<div class="article-actions"><button type="button" data-review-panel="saved">'+icon('saved')+'Save</button><button type="button" data-review-panel="share">'+icon('share')+'Share</button><button type="button" data-review-panel="search">'+icon('search')+'Search preview</button><small>Unpublished preview</small></div>'

def script():
    return (ROOT/'review_shell.js').read_text(encoding='utf-8')

def csp():
    digest=base64.b64encode(hashlib.sha256(script().encode()).digest()).decode()
    return "default-src 'none'; script-src 'sha256-"+digest+"'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"

def panels():
    return '''<dialog id="review-panel" aria-labelledby="panel-title"><div class="panel-top"><h2 id="panel-title">Review tools</h2><button type="button" id="close-panel" aria-label="Close panel">×</button></div><div id="panel-message"></div><div id="review-search" hidden><label for="review-query">Search this review bundle</label><input id="review-query" type="search" placeholder="Search Pompeii or History…" autocomplete="off"><div id="review-results" role="status" aria-live="polite"></div></div><p class="panel-foot">Offline preview · No account or public article connection</p></dialog><noscript><p class="notice">Review tools require JavaScript. The article, contents and navigation links remain readable.</p></noscript><script>'''+script()+'''</script>'''
