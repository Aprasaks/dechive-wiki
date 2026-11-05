"""Build an OFFLINE editorial review, never a public serving source.

Deliberately limited Markdown: headings, paragraphs, lists, tables, bold,
emphasis, HTTPS auto-links and [S1, S2] references. Raw HTML is text.
No remote assets, scripts, publication metadata or public share controls.
"""
import argparse
import html
import re
from pathlib import Path
from urllib.parse import urlsplit
from validate_frontmatter import validate

ROOT = Path(__file__).resolve().parent

def esc(value):
    return html.escape(value, quote=True)

def safe_url(value):
    try:
        u = urlsplit(value)
        return u.scheme == 'https' and bool(u.hostname) and not u.username and not u.password and not any(c.isspace() for c in value)
    except ValueError:
        return False

def inline(value, sources):
    """Escape first at token boundaries; authored markup never becomes HTML."""
    pattern = r'https://[^\s<>]+|\[S\d+(?:, S\d+)*\]|\*\*[^*]+\*\*|(?<!\*)\*[^*]+\*(?!\*)'
    parts, pos = [], 0
    for m in re.finditer(pattern, value):
        parts.append(esc(value[pos:m.start()]))
        token = m.group()
        if token.startswith('https://'):
            if safe_url(token):
                parts.append('<a rel="noreferrer noopener" href="'+esc(token)+'">'+esc(token)+'</a>')
            else:
                parts.append(esc(token))
        elif token.startswith('[S'):
            keys = re.findall(r'S\d+', token)
            if any(k not in sources for k in keys):
                raise ValueError('undefined source reference: '+token)
            parts.append('['+', '.join('<a class="cite" href="#source-'+k+'">'+k+'</a>' for k in keys)+']')
        elif token.startswith('**'):
            parts.append('<strong>'+esc(token[2:-2])+'</strong>')
        else:
            parts.append('<em>'+esc(token[1:-1])+'</em>')
        pos = m.end()
    parts.append(esc(value[pos:]))
    return ''.join(parts)

def render_body(body):
    source_keys = re.findall(r'^- \*\*(S\d+)\.\*\*', body, re.M)
    if len(source_keys) != len(set(source_keys)):
        raise ValueError('duplicate source key')
    sources = set(source_keys)
    lines = body.splitlines()
    output, toc, counts = [], [], {}
    i = 0
    # Draft includes a plain manually numbered contents section; replace with linked TOC.
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        h = re.fullmatch(r'(#{1,3}) (.+)', line)
        if h:
            level, label = len(h[1]), h[2]
            if level == 1:
                i += 1
                continue  # template renders validated H1 once
            if label == 'Contents':
                i += 1
                while i < len(lines) and not lines[i].startswith('## '):
                    i += 1
                continue
            base = re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-') or 'section'
            counts[base] = counts.get(base, 0) + 1
            anchor = base if counts[base] == 1 else base+'-'+str(counts[base])
            toc.append((level, label, anchor))
            output.append(f'<h{level} id="{anchor}">{esc(label)}</h{level}>')
            i += 1
        elif line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            if len(rows) < 2 or not all(re.fullmatch(r':?-{3,}:?', c) for c in rows[1]):
                raise ValueError('table missing separator')
            if any(len(r) != len(rows[0]) for r in rows):
                raise ValueError('inconsistent table width')
            output.append('<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable data table"><table><thead><tr>'+''.join('<th scope="col">'+inline(c,sources)+'</th>' for c in rows[0])+'</tr></thead><tbody>')
            output.extend('<tr>'+''.join('<td>'+inline(c,sources)+'</td>' for c in row)+'</tr>' for row in rows[2:])
            output.append('</tbody></table></div>')
        elif line.startswith('- ') or re.match(r'^\d+\. ',line):
            ordered = not line.startswith('- ')
            tag = 'ol' if ordered else 'ul'
            output.append('<'+tag+'>')
            while i < len(lines):
                match = re.match(r'^\d+\. (.+)' if ordered else r'^- (.+)', lines[i].strip())
                if not match:
                    break
                text = match[1]
                source = re.match(r'^\*\*(S\d+)\.\*\*',text)
                attr = ' id="source-'+source[1]+'"' if source else ''
                output.append('<li'+attr+'>'+inline(text,sources)+'</li>')
                i += 1
            output.append('</'+tag+'>')
        else:
            paragraph = [line]
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r'^(?:#{1,3} |\||- |\d+\. )',lines[i]):
                paragraph.append(lines[i].strip())
                i += 1
            output.append('<p>'+inline(' '.join(paragraph),sources)+'</p>')
    return '\n'.join(output), toc

def build(markdown, domain_href=None):
    data = validate(markdown)
    body = re.sub(r'\A---\r?\n.*?\r?\n---\r?\n', '', markdown, count=1, flags=re.S)
    rendered, toc = render_body(body)
    navigation = ''.join('<li><a href="#'+anchor+'">'+esc(label)+'</a></li>' for _,label,anchor in toc)
    domains = [data['primary_domain']]+data.get('secondary_domains',[])
    domain_label = esc(' · '.join(domains))
    if domain_href:
        if not re.fullmatch(r'[a-z0-9-]+\.html',domain_href):
            raise ValueError('domain link must be a local review filename')
        domain_label = '<a href="'+domain_href+'">'+esc(data['primary_domain'])+'</a>'+esc(' · '+' · '.join(domains[1:]) if domains[1:] else '')
    return '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'">
<title>Editorial review — '''+esc(data['title'])+''' | DECHIVE.WIKI</title>
<style>'''+(ROOT/'review.css').read_text()+'''</style></head><body>
<a class="skip" href="#article">Skip to article</a>
<header class="brand">DECHIVE.WIKI <span>Editorial preview</span></header>
<div class="notice" role="note">Unpublished draft · For editorial review only. This file contains the draft; do not upload it to a public host. Source checks and image selection remain open.</div>
<div class="layout"><aside><details open><summary>On this page</summary><nav aria-label="Article contents"><ol>'''+navigation+'''</ol></nav></details></aside>
<main id="article"><div class="domains">'''+domain_label+'''</div><h1>'''+esc(data['title'])+'''</h1>
<p class="summary">'''+esc(data['summary'])+'''</p>
<p class="state">English draft · Not approved or published</p>
<p class="feature-note">Public sharing and account bookmarks become available on the published article. No public article URL has been assigned.</p>
<article>'''+rendered+'''</article><footer>End of editorial preview · <a href="#article">Back to top</a></footer></main></div></body></html>'''

def build_domain_review(domain, manuscripts):
    """Shared taxonomy layout with explicit unpublished candidates, not catalog data."""
    items = []
    for markdown in manuscripts:
        data = validate(markdown)
        if domain not in [data['primary_domain']]+data.get('secondary_domains',[]):
            continue
        items.append('<li><a href="'+esc(data['slug'])+'.en.html">'+esc(data['title'])+'</a><p>'+esc(data['summary'])+'</p><small>Unpublished candidate · Editorial review only</small></li>')
    return '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Editorial domain review — '''+esc(domain)+'''</title><style>'''+(ROOT/'review.css').read_text()+'''</style></head><body><header class="brand">DECHIVE.WIKI <span>Domain template review</span></header><div class="notice">Offline editorial preview. Draft candidates below are not published entries.</div><main style="max-width:800px;margin:48px auto;padding:0 24px"><h1>'''+esc(domain)+'''</h1><p class="summary">Explore related knowledge and the connections between subjects in this field.</p><h2>Published entries</h2><p>No public catalog is connected to this offline preview.</p><h2>Editorial candidates</h2>'''+('<ul>'+''.join(items)+'</ul>' if items else '<p>No matching candidates in this review bundle.</p>')+'''</main></body></html>'''

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    markdown = args.input.read_text(encoding='utf-8')
    data = validate(markdown)
    domain_slug = re.sub(r'[^a-z0-9]+','-',data['primary_domain'].lower()).strip('-')
    domain_filename = 'domain-'+domain_slug+'.html'
    if args.output.name != data['slug']+'.en.html':
        raise ValueError('output name must be <slug>.en.html for linked review bundle')
    page = build(markdown,domain_filename)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(page,encoding='utf-8')
    (args.output.parent/domain_filename).write_text(build_domain_review(data['primary_domain'],[markdown]),encoding='utf-8')
    print('Offline unpublished review written:',args.output)
