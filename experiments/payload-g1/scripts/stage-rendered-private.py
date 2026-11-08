#!/usr/bin/env python3
"""Stage a rendered article locally; never approve, publish, or contact a service.

Input is a browser-derived article fragment, not the original S3 object.  The
immutable S3 snapshot remains the authority.  This format is intentionally NOT
accepted by the CMS or a public renderer without a separate reviewed adapter.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import urlsplit

from lxml import etree, html

DATA_IMAGE = re.compile(r"^data:image/(webp|png|jpeg);base64,([A-Za-z0-9+/=\s]+)$")
ALLOWED_TAGS = frozenset('article section div p h2 h3 h4 strong em small blockquote ul ol li table thead tbody tr th td col colgroup figure figcaption img a'.split())
ALLOWED_ATTRIBUTES = frozenset('id class href src alt title scope colspan rowspan loading width height role aria-label tabindex rel style start type'.split())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inspect_link(href):
    parsed = urlsplit(href)
    if parsed.scheme and parsed.scheme.lower() != 'https':
        raise ValueError('Only HTTPS and relative links may be staged')
    if parsed.netloc and (parsed.username or parsed.password):
        raise ValueError('Credentials in URLs are not accepted')
    if href.startswith('//'):
        raise ValueError('Protocol-relative URLs are not accepted')


def stage(source, output, provenance):
    raw = source.read_bytes()
    root = html.fromstring(raw.decode('utf-8', errors='strict'))
    if root.tag != 'article':
        raise ValueError('Expected a single article fragment')
    if output.exists():
        raise FileExistsError('Output exists; refusing to replace a previous snapshot')
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix='.staging-', dir=output.parent))
    os.chmod(temp, 0o700)
    media_dir = temp / 'media'
    media_dir.mkdir(mode=0o700)
    try:
        manifest = {'schema':'dechive-private-rendered-stage-v1', 'status':'unreviewed',
                    'publication_allowed':False, 'provenance':provenance,
                    'input_sha256':sha(raw), 'media':[], 'links':[], 'headings':[]}
        for node in root.iter():
            if not isinstance(node.tag, str) or node.tag not in ALLOWED_TAGS:
                raise ValueError(f'Unsupported element: {node.tag}')
            unknown = set(node.attrib) - ALLOWED_ATTRIBUTES
            if unknown:
                raise ValueError(f'Unsupported attributes on {node.tag}: {sorted(unknown)}')
            if node.get('style') and not re.fullmatch(r'width:\s*(?:\d|[1-9]\d|100)%', node.get('style')):
                raise ValueError('Unsupported inline style')
            if node.tag in ('h2','h3','h4'):
                manifest['headings'].append({'id':node.get('id'), 'text':' '.join(node.text_content().split())})
            if node.tag == 'a':
                href = node.get('href','')
                inspect_link(href)
                manifest['links'].append({'href':href, 'text':' '.join(node.text_content().split())})
            if node.tag == 'img':
                match = DATA_IMAGE.fullmatch(node.get('src',''))
                if not match:
                    raise ValueError('Image must be embedded as a supported data URL')
                data = base64.b64decode(re.sub(r'\s+', '', match.group(2)), validate=True)
                mime = match.group(1)
                valid = (mime == 'webp' and data[:4] == b'RIFF' and data[8:12] == b'WEBP') or (mime == 'png' and data.startswith(b'\x89PNG\r\n\x1a\n')) or (mime == 'jpeg' and data.startswith(b'\xff\xd8\xff'))
                if not valid:
                    raise ValueError('Image type does not match its contents')
                digest = sha(data)
                name = f'{digest}.{mime}'
                (media_dir / name).write_bytes(data)
                os.chmod(media_dir / name, 0o600)
                figure = node.getparent()
                while figure is not None and figure.tag != 'figure':
                    figure = figure.getparent()
                captions = figure.xpath('./figcaption') if figure is not None else []
                manifest['media'].append({'file':f'media/{name}','sha256':digest,'bytes':len(data),
                    'alt':node.get('alt',''),'caption':' '.join(captions[0].text_content().split()) if captions else '',
                    'rights_status':'pending'})
                node.set('src', f'media/{name}')
        article = etree.tostring(root, method='html', encoding='utf-8')
        (temp/'article.html').write_bytes(article)
        manifest['staged_html_sha256'] = sha(article)
        (temp/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        os.chmod(temp/'article.html',0o600)
        os.chmod(temp/'manifest.json',0o600)
        os.rename(temp, output)
        return manifest
    except Exception:
        shutil.rmtree(temp, ignore_errors=True)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--provenance', required=True)
    args = parser.parse_args()
    result = stage(args.input, args.output, args.provenance)
    print(json.dumps({'status':result['status'], 'publication_allowed':result['publication_allowed'],
                      'headings':len(result['headings']), 'links':len(result['links']),
                      'media':len(result['media'])}))
