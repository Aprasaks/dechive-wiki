# Authoring metadata and public SEO contract

Status: authoring rules applied to the Pompeii Markdown draft. Runtime metadata projection, routing changes and DB migrations are NOT implemented by this document. No publication or indexing authorization is implied by frontmatter.

## Writer-facing frontmatter

Required: title, slug, language, document_type, summary, primary_domain.
Optional: aliases, secondary_domains, seo.title, seo.description, social.title, social.description, social.image_ref.

language describes this rendition/file, never an entity's identity. document_type is a proposed internal subject type resolved against the existing type registry at import, not an automatic Schema.org page type. Domain labels are validated/resolved against the taxonomy at import; a free-text label cannot create categories.

No author-entered entity/revision/user IDs, timestamps, review/publication statuses, canonical URL, robots instructions, JSON-LD or sameAs in the authoring frontmatter. An importer allocates new entity identity or receives an explicit existing-entity binding outside the manuscript; it must not identify the entity by mutable title/slug. Do not assume every import creates a new entity.

The source-review date and remaining verification work belong in the editorial sidecar. Removing status from frontmatter does not approve a draft: content/drafts/ files are non-public input and never a public serving source.

## Defaults and overrides

- UI title: title. SEO title: seo.title or title plus site name, once.
- UI/internal search summary: summary. Search description: seo.description or summary.
- Share title/description: explicit social override, otherwise the corresponding SEO value.
- Shared image: social.image_ref resolved through approved asset records; otherwise the approved representative asset, otherwise omit. Never fabricate an image URL.
- Distinct fields permit different text; they do not require duplicate manual writing.
- Search title/description must accurately represent the article. H1 and SEO title may match. Lengths are editorial previews, not Google-mandated 60/155-character hard limits.
- No meta-keywords output. Optional internal search aliases are not ranking tags.

All authored text is untrusted: validate its shape, escape HTML metadata, and safely serialize JSON-LD (including less-than characters). Never insert author-supplied markup into head.

## System-owned data

The DB owns stable entity and revision IDs, actual actor identities, audit timestamps, decisions and the active public snapshot. Public dates are first publication and substantive public modification dates, not dates of unsent draft edits. A source-access date is not an independent review approval.

Publication needs immutable revision-bound title/summary/SEO/social/subject bindings as well as body. Current experimental body-only schema is not yet a complete metadata implementation. Metadata edits must create a reviewable revision; do not read live draft fields while rendering an older public snapshot.

## Public output decision

| Request | Body and metadata source | Indexing/security |
| --- | --- | --- |
| Current public entry, even with a newer working draft | Active approved snapshot only | Eligible for indexing in production when public access is enabled |
| Authenticated working-draft preview | Selected draft, only after authorization | Authentication plus noindex and private/no-store; no shared cache |
| Unauthorized draft or unpublished entity | No private content, including metadata/JSON-LD | Deny with appropriate 401/403/404 |
| Withdrawn entry with no active public snapshot | No stale public body or metadata | Appropriate removal response and cache invalidation |
| Old-slug alias for a still-public entry | Resolve to current public canonical | Direct permanent 301 or 308 |
| Public historical revision, if a future history feature permits it | Explicit historic-public revision only | Separate policy; do not pretend different historical content is a duplicate |
| Search/results/admin pages | Route-specific policy | Not automatically indexable because some entry exists |

Draft status must never force noindex onto an existing approved public URL. Conversely, noindex is not security: private data must never be sent to unauthorized clients. A shared cache must not contain previews. Site-wide staging protection remains independent of per-entry eligibility.

## Canonical routing

Choose a canonical route format before implementation; /e/pompeii is not yet an agreed route. Derive the URL from trusted production origin and the persisted public route, not an arbitrary frontmatter URL or Host header.

Title changes do not require slug changes. Persist old slugs when routes change; check collisions, prevent loops/chains and redirect directly to the current public URL. Update internal links and sitemap together. Equivalent tracking/print variants can share canonical; substantively different histories and other languages require their own deliberate policy.

Sitemap contains only current public canonical URLs; lastmod reflects public substantive changes. Exclude draft/private/search URLs and do not enumerate drafts via sitemap. Robots rules must not prevent crawling when a noindex instruction needs to be read.

## External identity and structured data

Keep verified external identifiers on the subject entity, with provider, exact URI, verification source/date and review state. Match the same entity (ancient city, archaeological property and eruption are not interchangeable). Do not populate example QIDs or force VIAF/Getty identifiers when not appropriate.

A public document may use a suitable CreativeWork/Article type and about/mainEntity to identify its subject. Put sameAs on that subject when exact identity is verified, not on the article merely because the article discusses it. Mentioning another topic does not make it identical.

Project visible citations from the approved revision's evidence/source records; citation markup is not itself evidence validation. No invented review ratings, hidden claims or dates. Emit publisher/author identity only as actually represented. Structured data does not guarantee knowledge-panel inclusion, rich results or ranking.

OG/X fields are generated from this same approved projection; resolve image IDs to accessible absolute URLs after rights/public-use checks. Missing approved images are omitted rather than borrowed from unverified source pages.

## Runtime acceptance checks before public release

1. Publish A, create/edit draft B: public body, title, description, dates, JSON-LD, OG and indexing settings remain A.
2. Draft-only entity: unauthorized body, head, API, search, sitemap and caches reveal no draft metadata.
3. Approve/publish B atomically: all public representations switch to B together.
4. Withdraw: public projections and cached representations no longer serve withdrawn content.
5. Change slug: old URL redirects directly once; new URL self-canonicalizes; sitemap/internal links agree.
6. Invalid external-identity or image-rights records are excluded from public structured/share data.
7. Inspect actual generated HTML, HTTP headers and structured data; authoring validation alone cannot establish SEO correctness.

These checks are implementation requirements, not tests claimed passed in the current runtime.

## Official references

- Google titles: https://developers.google.com/search/docs/appearance/title-link
- Google snippets: https://developers.google.com/search/docs/appearance/snippet
- Permanent redirects: https://developers.google.com/search/docs/crawling-indexing/301-redirects
- Canonicalization: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- noindex: https://developers.google.com/search/docs/crawling-indexing/block-indexing
- Structured-data rules: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Schema.org sameAs: https://schema.org/sameAs
- Schema.org about: https://schema.org/about

## Local authoring check

Requires Python 3 and PyYAML. Run from the repository root:

    python3 content/validate_frontmatter.py content/drafts/pompeii.en.md

This checks field shape, duplicate keys, English-only pilot scope and H1 consistency. Taxonomy/type resolution, asset rights, factual review, HTML escaping and runtime publication gates are separate requirements. Five invalid-input probes (robots override, duplicate title, authored canonical, unsafe slug and unsupported language) were rejected during this change.
