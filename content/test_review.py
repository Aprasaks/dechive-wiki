"""Integrity and isolation checks for the offline review renderer."""
import unittest
import re
import hashlib
import base64
from html.parser import HTMLParser
from pathlib import Path
from build_review import build, build_domain_review, render_body, inline
from review_shell import header

class Inspect(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]; self.links=[]; self.tags=[]; self.meta=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs); self.tags.append(tag)
        if 'id' in a:self.ids.append(a['id'])
        if tag=='a':self.links.append(a.get('href',''))
        if tag=='meta':self.meta.append(a)

class ReviewTests(unittest.TestCase):
    def test_complete_draft_and_local_references(self):
        page=build((Path(__file__).parent/'drafts/pompeii.en.md').read_text())
        p=Inspect();p.feed(page)
        self.assertEqual(p.tags.count('h1'),1)
        self.assertEqual(p.tags.count('h2'),18)  # 17 article headings + review panel heading
        self.assertEqual(p.tags.count('table'),3)
        self.assertEqual(len(p.ids),len(set(p.ids)))
        for href in p.links:
            if href.startswith('#'):self.assertIn(href[1:],p.ids)
        self.assertEqual(len([x for x in p.ids if x.startswith('source-')]),13)
    def test_raw_html_and_unsafe_links_are_not_executable(self):
        rendered=inline('<img src=x onerror=alert(1)> **<script>bad</script>** https://user:pass@example.com [bad](javascript:alert(1))',set())
        p=Inspect();p.feed(rendered)
        self.assertNotIn('script',p.tags);self.assertNotIn('img',p.tags)
        self.assertEqual(p.links,[])
    def test_missing_or_duplicate_sources_fail(self):
        with self.assertRaises(ValueError):render_body('Text [S999]')
        with self.assertRaises(ValueError):render_body('- **S1.** one\n- **S1.** two')
    def test_duplicate_heading_ids_are_unique(self):
        _,toc=render_body('## A\n\ntext\n\n## A\n')
        self.assertEqual([x[2] for x in toc],['a','a-2'])
    def test_unpublished_not_public_metadata(self):
        page=build((Path(__file__).parent/'drafts/pompeii.en.md').read_text())
        p=Inspect();p.feed(page)
        self.assertIn({'name':'robots','content':'noindex,nofollow,noarchive'},p.meta)
        self.assertEqual(p.tags.count('script'),1)  # trusted hash-authorized UI only
        self.assertFalse(any(m.get('property','').startswith('og:') for m in p.meta));self.assertNotIn('rel="canonical"',page)
        self.assertNotIn('datePublished',page)
    def test_malformed_table_fails(self):
        with self.assertRaises(ValueError):render_body('| a | b |\n| --- | --- |\n| one |')
    def test_review_controls_have_hash_authorization_without_credentials(self):
        page=build((Path(__file__).parent/'drafts/pompeii.en.md').read_text())
        scripts=re.findall(r'<script>(.*?)</script>',page,re.S)
        self.assertEqual(len(scripts),1)
        digest=base64.b64encode(hashlib.sha256(scripts[0].encode()).digest()).decode()
        p=Inspect();p.feed(page)
        policy=next(m['content'] for m in p.meta if m.get('http-equiv')=='Content-Security-Policy')
        self.assertIn("script-src 'sha256-"+digest+"'",policy)
        self.assertNotIn('form',p.tags)
        self.assertNotIn('type="password"',page)
        for expected in ['review-panel','review-query','close-panel','review-results']:
            self.assertIn(expected,p.ids)
    def test_domain_candidates_are_not_published_or_unrelated(self):
        md=(Path(__file__).parent/'drafts/pompeii.en.md').read_text()
        self.assertIn('pompeii.en.html',build_domain_review('History',[md]))
        p=Inspect();p.feed(build_domain_review('Technology',[md]));self.assertNotIn('pompeii.en.html',p.links)
        self.assertIn('Unpublished candidate',build_domain_review('History',[md]))
        with self.assertRaises(ValueError):build(md,'https://example.com/')
    def test_home_link_uses_top_in_same_tab_and_real_logo(self):
        h=header()
        self.assertIn('href="https://dechive.wiki/#top"',h)
        self.assertNotIn('target="_blank"',h)
        self.assertIn('M3 7 12 3l9 4v11l-9 4-9-4V7Z',h)

if __name__=='__main__':unittest.main()
