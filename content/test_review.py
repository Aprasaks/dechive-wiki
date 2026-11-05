"""Integrity and isolation checks for the offline review renderer."""
import unittest
from html.parser import HTMLParser
from pathlib import Path
from build_review import build, build_domain_review, render_body, inline

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
        self.assertEqual(p.tags.count('h2'),17)  # 14 chapters + glance, glossary, sources
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
        self.assertNotIn('script',p.tags)
        self.assertNotIn('og:',page);self.assertNotIn('rel="canonical"',page)
        self.assertNotIn('datePublished',page)
    def test_malformed_table_fails(self):
        with self.assertRaises(ValueError):render_body('| a | b |\n| --- | --- |\n| one |')
    def test_domain_candidates_are_not_published_or_unrelated(self):
        md=(Path(__file__).parent/'drafts/pompeii.en.md').read_text()
        self.assertIn('pompeii.en.html',build_domain_review('History',[md]))
        self.assertNotIn('pompeii.en.html',build_domain_review('Technology',[md]))
        self.assertIn('Unpublished candidate',build_domain_review('History',[md]))
        with self.assertRaises(ValueError):build(md,'https://example.com/')

if __name__=='__main__':unittest.main()
