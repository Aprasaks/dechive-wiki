"""Reject any artifact that is not the nine-file, reviewed, offline-only preview."""
from __future__ import annotations
import pathlib, re, sys

if len(sys.argv) != 2:
    raise SystemExit('usage: validate_bundle.py <offline-preview-directory>')
root = pathlib.Path(sys.argv[1]).resolve(strict=True)
expected = {
    'index.html', 'preview.js',
    *('reference/' + x + '.webp' for x in (
        'hero', 'trail', 'journey-ai', 'journey-civilization',
        'journey-life', 'colosseum', 'maya')),
}
actual: set[str] = set()
for p in root.rglob('*'):
    if p.is_symlink():
        raise SystemExit(f'FAIL: symlink in artifact: {p}')
    if p.is_file():
        actual.add(p.relative_to(root).as_posix())
        if p.stat().st_size > 9_000_000:
            raise SystemExit(f'FAIL: oversize preview asset: {p}')
assert actual == expected, f'Unexpected or missing preview files: {actual ^ expected}'
assert sum((root / p).stat().st_size for p in actual) < 12_000_000
html = (root / 'index.html').read_text(encoding='utf-8')
js = (root / 'preview.js').read_text(encoding='utf-8')
assert '<html' in html and 'reference-home' in html
assert 'OFFLINE DESIGN REVIEW' in html
assert 'No public records in this offline preview.' in html
assert 'No live data' in html
assert 'src="./preview.js"' in html
assert 'PRIVATE CHROME FIXTURE' not in html
assert not any(item in html for item in ('/_next/', 'href="/knowledge/', 'https://', 'http://'))
assert not any(item in js for item in ('fetch(', 'XMLHttpRequest', 'WebSocket(', 'https://', 'http://'))
assert re.search(r'form\.addEventListener\(.submit.', js)
for p in expected - {'index.html', 'preview.js'}:
    assert (root / p).read_bytes().startswith(b'RIFF'), f'Not a WebP: {p}'
print('PASS: nine offline-only files; no private data, external APIs or synthetic publications')
