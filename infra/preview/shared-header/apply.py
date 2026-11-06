"""Apply one shared header to pre-existing, access-controlled preview HTML.

This only changes local HTML files supplied by the caller; it never uploads or
changes permissions. The homepage and article use the exact same component.
"""
from pathlib import Path
import argparse
import re

ROOT = Path(__file__).resolve().parent
HEADER = (ROOT / 'header.html').read_text(encoding='utf-8').strip()
CSS = (ROOT / 'header.css').read_text(encoding='utf-8').strip()
STYLE_ID = 'dechive-shared-header'
HEADER_RE = re.compile(r'<header\b[^>]*class="(?:ref-header|site-header)"[^>]*>.*?</header>', re.S)
STYLE_RE = re.compile(r'<style id="(?:shared-preview-header|dechive-shared-header)">.*?</style>', re.S)

def apply(source: str) -> str:
    if not HEADER.startswith('<header class="ref-header"'):
        raise ValueError('Invalid header component')
    if source.count('</head>') != 1 or len(HEADER_RE.findall(source)) != 1:
        raise ValueError('Expected exactly one document head and preview header')
    original_robots = re.findall(r'<meta\b[^>]*name=["\']robots["\'][^>]*>', source, re.I)
    cleaned = STYLE_RE.sub('', source)
    result = HEADER_RE.sub(lambda _: HEADER, cleaned, count=1)
    result = result.replace('</head>', f'<style id="{STYLE_ID}">{CSS}</style></head>', 1)
    if re.findall(r'<meta\b[^>]*name=["\']robots["\'][^>]*>', result, re.I) != original_robots:
        raise ValueError('Robots metadata changed')
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('html', nargs='+', type=Path)
    args = parser.parse_args()
    # Validate every page before touching any file.
    results = [(path, apply(path.read_text(encoding='utf-8'))) for path in args.html]
    for path, content in results:
        path.write_text(content, encoding='utf-8')
        print(f'Updated {path}')

if __name__ == '__main__':
    main()
