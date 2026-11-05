# Implementation audit and next executable step

Date: 2026-11-05 (Asia/Seoul).
Scope: content branch source, authoring contract, public reader route/library,
public evidence migration, associated CI definition, editorial review notes and
previous deployment records. This is not a fresh penetration test, cost audit,
IAM review, restore drill or live infrastructure health check.

## Findings

| Priority | Finding / evidence | Required next action |
| --- | --- | --- |
| P0 before public content | Main site is a protected static design preview; private reader pilot is a different runtime. | Select a single reviewed integration/release commit; connect real runtime deliberately, retain current protection until release. |
| P0 before metadata release | public-reading.ts returns body/version/IDs/evidence, without a complete revision-bound title/summary/taxonomy/SEO projection. | Add immutable revision metadata and atomic public projection, including A-public/B-draft isolation tests. Do not render draft frontmatter on public pages. |
| P0 before approval | Pompeii S7 passage retrieval and final review remain incomplete; no rights-cleared images. | Resolve editorial sidecar items, durable claim/source anchors, human approval; never label a draft verified by inference. |
| P0 before account saves | No proven production account bookmark flow in reviewed files. | Real reader authentication, owned persistence, idempotent save/remove and login-return tests. No fake local account persistence. |
| P1 | knowledge/[id]/page.tsx splits body into plain paragraphs and exposes revision/checksum information prominently. | Integrate a safe long-form rendering format; title once, TOC, tables, citations, accessible long-page layout. Technical revision details should be secondary. |
| P1 | Public routes currently use UUID; slug routing and redirect policy are not implemented by the authoring contract. | Pick canonical route, persist aliases, collision handling, direct permanent redirects, stable section IDs. Do not invent final canonical in draft. |
| P1 | Domain/category, Journey and related-subject requirements exist primarily as design/contracts. | Controlled taxonomy and shared templates; distinguish factual relations from editorial recommendations; no links to nonexistent public articles. |
| P1 | SEO/share output and sitemap are requirements, not proven runtime output. | Generate head, JSON-LD, OG/X and sitemap from one approved snapshot; actual HTTP verification. |
| P1 | Sources are editorial S-numbers, not completed production claim bindings. | Durable per-revision evidence import and review, preserving contradictions and limitations. |
| P1 | Branches separate UI changes, content and infrastructure; old README status is misleading. | Keep cross-links and create an explicit integration PR before release; do not treat a branch push as deployment. |
| P1 before cutover | Earlier pilot only demonstrated local backup/restore; off-host recovery and production staff integration remain open in review notes. | Test off-host backup and recovery, authentication, monitoring and rollback before public runtime cutover. |

## Implemented in this change

- Reproducible **offline editorial** article and shared domain review layout.
- Current Pompeii manuscript rendered with one H1, 17 section headings, three tables and 13 source anchors; manual Contents replaced by linked navigation.
- Sidebar moves above body on narrow screens; tables have their own keyboard-focusable scroll region; long URLs wrap; print rules included.
- All raw HTML escaped; source links restricted to credential-free HTTPS; undefined/duplicate source references and malformed tables fail the build.
- Draft notice, restrictive content security policy, noindex; no public canonical/OG/publication dates, no pretend share/save buttons.
- History candidate list is explicitly unpublished, not a public catalog.
- No AWS, DNS, authentication, public indexing or content publication changes in this commit.

## Verification actually performed

Commands from repository root:

```sh
python3 content/validate_frontmatter.py content/drafts/pompeii.en.md
python3 -m unittest discover -s content -p test_review.py -v
python3 content/build_review.py content/drafts/pompeii.en.md content/reviews/pompeii.en.html
```

Seven unit checks passed: real draft structure and anchor resolution; raw HTML/unsafe-link isolation; missing/duplicate source rejection; duplicate heading disambiguation; no public metadata on draft; malformed-table rejection; category filtering and unpublished labels.

These checks do not prove production SEO, responsive visual rendering, browser keyboard behavior, authentication or end-to-end publishing. Browser visual QA remains outstanding. Generated HTML is a review artifact and must never be used as a public draft serving source. noindex/CSP do not encrypt or protect the file from a person who has it. The manuscript already resides on this content branch; this artifact adds no external hosting.

## Resume here

1. Review the local Pompeii/History HTML bundle and address layout feedback; complete S7, glossary and image-rights review.
2. Implement revision-bound metadata/schema and public projection before adapting the live reader, rather than sending draft files to public routes.
3. Implement category queries and approved related links, public metadata/share controls and real account bookmarks.
4. Run acceptance checklist in ARTICLE_DISCOVERY_AND_SHARING.md and AUTHORING_METADATA.md against one integration commit.
5. Editorial approval and explicit public cutover; public UI changes alone are not publication.

## Offline reviewer usage

Open content/reviews/pompeii.en.html and follow History to its sibling domain template. Both files are self-contained; keep them together. Rebuild after manuscript or stylesheet edits. Requires Python 3 and the same PyYAML dependency as the existing frontmatter validator.

The renderer intentionally covers only this manuscript's Markdown subset (headings, paragraphs, lists, pipe tables, bold/emphasis, HTTPS auto-links and S-references). It is not a general Markdown engine or production rendering library. Production integration should select and pin a maintained renderer and sanitization policy with browser tests; do not silently expand this pilot parser into the public runtime.
