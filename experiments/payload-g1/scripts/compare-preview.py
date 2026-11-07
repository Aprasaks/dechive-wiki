#!/usr/bin/env python3
"""Compare local preview structure without publishing or extracting manuscript text.

The report is a change detector, not editorial, factual, rights, or visual review.
"""
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import sys


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


class Preview(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ignored = 0
        self.caption = None
        self.captions = []
        self.alts = []
        self.images = []
        self.counts = {'headings': 0, 'tables': 0, 'figures': 0, 'images': 0, 'links': 0}
        self.text = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('style', 'script', 'noscript'):
            self.ignored += 1
        if self.ignored:
            return
        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self.counts['headings'] += 1
        if tag in ('table', 'figure', 'img', 'a'):
            self.counts[{'table':'tables', 'figure':'figures', 'img':'images', 'a':'links'}[tag]] += 1
        if tag == 'img':
            self.alts.append(a.get('alt', ''))
            self.images.append(digest(a.get('src', '')))
        if tag == 'figcaption':
            self.caption = []

    def handle_endtag(self, tag):
        if tag in ('style', 'script', 'noscript') and self.ignored:
            self.ignored -= 1
            return
        if not self.ignored and tag == 'figcaption' and self.caption is not None:
            self.captions.append(' '.join(''.join(self.caption).split()))
            self.caption = None

    def handle_data(self, data):
        if not self.ignored:
            self.text.append(data)
            if self.caption is not None:
                self.caption.append(data)

    def snapshot(self):
        return {'counts': self.counts, 'visible_text_sha256': digest(' '.join(' '.join(self.text).split())),
                'image_sources_sha256': digest(json.dumps(self.images)),
                'alt_text_sha256': digest(json.dumps(self.alts, ensure_ascii=False)),
                'captions_sha256': digest(json.dumps(self.captions, ensure_ascii=False))}


def inspect(path):
    parser = Preview()
    parser.feed(Path(path).read_text(encoding='utf-8'))
    return parser.snapshot()


def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: compare-preview.py BEFORE.html AFTER.html')
    before, after = (inspect(path) for path in sys.argv[1:])
    changes = [key for key in before if before[key] != after[key]]
    print(json.dumps({'before': before, 'after': after, 'changed': changes,
                      'note': 'Local comparison only; source versions and publication status are not established.'}, indent=2))


if __name__ == '__main__':
    main()
