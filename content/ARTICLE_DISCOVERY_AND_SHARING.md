# Article pages, discovery, sharing and saved entries
Decision record: 2026-11-05 (Asia/Seoul). Repository requirements, not a claim of deployed functionality.
User goal: English knowledge writing with a perspective, connected like living cells. Reading, discovery, keeping and sharing knowledge are one product flow.

## Implementation status
- Existing authoring contract and Pompeii Markdown draft exist; see [AUTHORING_METADATA.md](AUTHORING_METADATA.md).
- Pompeii is not published. Public site is a protected static design preview.
- Article page, taxonomy templates, runtime SEO projection, share controls and account bookmarks below are requirements; not completed by this document.
- Existing authoring validator supports only the fields listed in the authoring contract. Proposed fields below are not accepted frontmatter until schema/importer/validator changes land.
- No hosting, authentication, indexing or publication changes are authorized by saving this document.

## Metadata ownership
| Data | Owner | Purpose |
| --- | --- | --- |
| title, slug, summary | Writer; slug persisted by routing | Visible title, stable path component, discovery cards |
| language | Rendition/revision | English now; never part of subject identity |
| aliases | Writer, validated | Alternate names for internal discovery; not SEO keyword stuffing |
| document_type | Subject registry | What the subject is; not the editorial format or automatic Schema.org type |
| primary_domain, secondary_domains | Taxonomy bindings | Main and cross-domain discovery |
| editorial format (proposed) | Editorial model | Knowledge entry versus Knowledge Journey; separate from subject type |
| categories (proposed) | Controlled taxonomy | Narrower groupings, resolved to existing records |
| related subjects and typed relations (proposed) | Reviewed graph records | Explain why subjects connect |
| Journey membership/order/rationale (proposed) | Editorial collection | Reading path; not a historical factual assertion |
| seo.title, seo.description | Optional writer override | Defaults: title + site name once, and summary |
| social.title, social.description, social.image_ref | Optional writer override | SEO fallback; approved representative asset fallback |
| entity/revision/actor IDs, statuses and audit dates | System | Identity, accountability and publication |
| canonical, robots, OG/X, JSON-LD, sitemap | System projection | Generated consistently from active public snapshot |
| reading time and heading navigation | System | Derived from body, not manually maintained |

Keep factual relationships and editorial reading recommendations distinct. Factual graph claims require evidence and review. A recommendation must carry an explanatory rationale without implying a factual relation.
Ancient Pompeii, the archaeological property, and the AD 79 eruption must not be silently conflated. Final subject type registry and relation vocabulary require resolution before importing.

## Evidence and assets
Source records: title; author/institution; original URL or applicable DOI/ISBN; publication/access dates; exact page/section; supported claims; limitations.
Asset records: original file/page; creator; license and usage conditions; required credit; public-use review; dimensions/MIME; contextual alt; caption. Alt is not the credit or caption.
External identifiers: provider, exact URI, identity match, verification evidence/date and review state. sameAs belongs to the matched subject, not an article that merely discusses it.
These are linked records, not dozens of UUIDs or factual claims stuffed into Markdown frontmatter.

## Taxonomy and page templates
- Domain/category pages use a shared template: name, slug, introduction, parent where applicable, approved public entry list, selected journeys.
- A category groups entries; a knowledge entry explains a subject. An Ancient Rome category and an Ancient Rome entry can coexist without pretending to be the same page.
- Empty categories show an honest empty state; index eligibility is deliberate, not automatic.
- Entry page: title, summary, byline and real public dates, save/share controls, responsive long-form body, heading navigation, images/credits, citations, related knowledge and journeys.
- Journey page: title, introduction, selection rationale, ordered entries, editor identity.
- Homepage and author page receive their own truthful metadata.
- Choose real direct article routes before implementation. Hash navigation on the homepage is not an article routing strategy.

## Share without sign-in
| Control | Expected behavior |
| --- | --- |
| Copy link | Copy current public canonical; announce success only after successful copy; provide selectable URL on failure |
| Share | Prefer native share where available; otherwise show a small accessible share sheet |
| Social destination | Explicit user action opens selected service with public title/URL; never auto-post |
| Share section | Canonical plus stable heading anchor; persist anchor aliases when headings change |

Place Save and Share near the title; repeat sharing and related discovery at the end. Avoid a permanently crowded row of social logos.
Share cards use public title/description/approved image, OG type and canonical URL; image alt and dimensions come from the asset. Platform caches can delay updated cards.
Handle unsupported native share, cancellation, clipboard failure and missing image without false success. No third-party tracking SDK is needed for basic links.
Share links must never contain passwords, session tokens, signed preview credentials or private metadata. Private preview access remains authenticated; do not advertise its URL as a public article link.
Use accessible button labels, keyboard operation, focus return on sheet close and announced status feedback.

## Account bookmarks
- Login is required for cross-device account storage, not for reading/sharing public articles.
- Store user ID + stable entry ID + actual saved timestamp; unique user/entry pair, idempotent save/remove.
- Slug/title changes must not break bookmarks. Resolve current public content at read time.
- If login is needed, preserve only a validated internal return destination and pending save intent; after login return to entry and complete/confirm the save.
- Pending intent must not save to another user's account or trust an arbitrary external redirect.
- Enforce ownership server-side; unauthenticated users and other accounts cannot read/change someone's list.
- Show saved/unsaved state only when confirmed; handle network error and rapid repeat clicks.
- If entry is withdrawn/private, show an unavailable state without leaking stale title, summary, image or body.
- Personal bookmark lists are private and excluded from public search, sitemap and shared caches.

## SEO/publication contract
See the authoring contract for authoritative rules:
- Render initial HTML body, head, OG and JSON-LD from the same active approved revision.
- Public A remains A while draft B is edited; draft dates cannot update public dates.
- Real author/publisher, first public date and substantive public modification date only.
- Permanent old-slug redirect directly to new canonical; prevent collisions, loops and chains; update internal links and sitemap.
- Sitemap lists current public canonicals only. noindex does not protect private data.
- Structure may use suitable Article/CreativeWork with about/mainEntity, visible citations and approved subject identities; no guaranteed ranking/rich result claims.
- No meta keywords. Title/description length previews are guidance, not mandatory Google character limits.
- Verify generated HTML/headers, accessible links and search indexing after production public release.

## Acceptance checklist (not yet passed)
- [ ] Long-form Pompeii entry works on desktop/mobile; no clipped body/TOC/citations.
- [ ] History template shows only approved public entries; empty category has a useful empty state.
- [ ] Every related link has a destination or honest unavailable state; no fake public entries.
- [ ] Native share, fallback, cancellation, copy failure/success and keyboard flow checked.
- [ ] Shared URL is canonical and survives slug changes; heading links survive heading edits.
- [ ] Share card uses approved public metadata and rights-cleared image.
- [ ] Anonymous save resumes after login; repeated save is idempotent; account isolation checked.
- [ ] Withdrawn/private entry cannot leak through bookmarks, shares, APIs or caches.
- [ ] Public A / draft B metadata consistency and atomic publication checked.
- [ ] Canonical, redirect, sitemap, robots and actual HTML/JSON-LD checked.

## Next implementation order
1. Resolve subject types, category vocabulary, direct article routes and revision-bound metadata storage.
2. Build private Pompeii article preview plus shared domain/category template.
3. Implement public-safe metadata and share UI; account bookmarks with authentication/persistence, never a pretend local-only account save.
4. Run acceptance checks, obtain editorial approval, then deliberately connect homepage and enable public release.
