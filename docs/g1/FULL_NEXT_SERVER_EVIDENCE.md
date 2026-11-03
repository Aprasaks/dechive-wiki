# G1 — Real Next.js App Router Full-Server Proof

**Date:** 2026-11-03  
**Status:** G1 PARTIAL PASS — production deployment NO-GO  
**Experiment:** \`experiments/payload-g1\` on independent stacked branch \`p0/g1-next-full-server-gate\`  
**No paid AWS resource, DNS change, production data, or external accounts.**

**Release status:** 24/24 real Next.js App Router development HTTP checks, **11/11 compiled production HTTP checks**, and successful Next.js optimized production build with strict TypeScript checks.

## What actually ran

- Actual **Next.js 16.4.4 App Router development server** under Node.js 22.23.4, with genuine **Payload CMS 3.92.1 REST and GraphQL handlers** and PostgreSQL 17.6.
- Real HTTP TCP requests on **127.0.0.1:3100** initiated four independently authenticated test accounts: two editors, a reviewer and a publisher.
- Editor submitted a private draft through Next.js REST, reviewer inspected and approved only an exact evidence-bound revision, publisher released the immutable Knowledge Core head through its restricted DB service role.
- The public reader's Next.js **server-rendered HTML** (\`/knowledge/[id]\`) and \`/sitemap.xml\` query the restricted PostgreSQL **public-only** account, not Payload's editorial tables.
- The English home page is a minimal **test-lab fixture**, not the finalized DECHIVE.WIKI editorial homepage.
- Next.js \`/api/\` and knowledge routes carry explicit anti-cache, anti-index and anti-frame headers. \`/robots.txt\` blocks all indexing because this is a private experimental preview, not a launched public site.
- Compiled **Next.js production build** is verified as a separate gate, not silently assumed from a working development server.

## Verified CI evidence

- [24/24 real Next.js App Router HTTP checks and successful optimized production build](https://github.com/Aprasaks/dechive-wiki/actions/runs/41648919804). On first compilation, three strict TypeScript checks failed. The optional request JSON method was narrowed correctly, an extensionless ESM import was used, and the build re-ran with \`NODE_ENV=production\`; all passed. Build type checking remains enabled.
- **11/11 compiled production \`next start\` HTTP smoke checks PASS**, including approved SSR HTML, unapproved 404, draft-query isolation, sitemap projection, anonymous native Payload REST/GraphQL denial, reviewer/publisher API denial, absent admin/preview routes, and noindex robots. The final [combined 35/35 run](https://github.com/Aprasaks/dechive-wiki/actions/runs/41649279464) completed **SUCCESS** with optimized webpack build and strict TypeScript verification.

### Development-server verified cases

1. Next.js serves a minimal English archive homepage, with no unreviewed content.
2. Robots disallows the isolated preview; sitemap is initially empty.
3. Unapproved UUID HTML returns 404 even with \`draft=true&preview=true\`.
4. Missing admin and preview paths return 404, not redirected private drafts.
5. Four distinct role identities log in through actual Payload REST; anonymous staff creation is denied.
6. Editor creates a private Payload draft with a signed JWT; guests and unrelated editor cannot read it.
7. Reviewer can inspect but cannot directly publish; native \`_status=published\` is explicitly forbidden.
8. Authenticated reviewer GraphQL reads a real draft; guest GraphQL cannot.
9. Cross-origin CORS probe is denied implicit wildcard and attacker-origin approval.
10. Publisher cannot release unapproved revision; editor cannot forge reviewer role.
11. Reviewer approves exact Knowledge Core revision with verified source link using restricted DB login.
12. Publisher HTTP endpoint advances approved immutable Knowledge Core head; version replay denied.
13. Actual Next.js SSR detail page displays approved body, with \`no-store\` caching.
14. Sitemap indexes only approved entity UUID; a later editor draft update never alters public HTML.
15. API sends \`no-store\`, \`X-Robots-Tag: noindex\`, and \`X-Frame-Options: DENY\`.

## Architecture hard boundaries

- **CMS remains private.** Payload's editorial draft REST and GraphQL are behind role checks; these URLs are not public content endpoints.
- **Public pages only read verified head.** There is no preview bypass route in the test web app. The read-only role cannot invoke a publisher or obtain raw draft tables.
- **Approval and publisher are distinct identities.** HTTP JWT authorizes a respective service that uses separate, scoped PostgreSQL roles; neither editor nor reviewer can directly publish.
- **Knowledge is English-first**, with no artificial sign-up or lead capture.

## Unresolved release gates — do NOT deploy as production

- Actual browser-admin editor UI, session/CSRF/proxy trust boundaries, production middleware and secure cookie behavior were not audited. Next.js server middleware is not configured in this experiment.
- Current reviewer audit stores the **database service login**, not a secure, immutable, individual-human reviewer proof bound to a revision digest. Identity rotation and access revocation remain untested.
- Claims and citations are **synthetic**; source truth, media license verification and rights takedown propagation have not been verified.
- No live cloud network, CDN, persistent storage, backup of an independent cluster, secret manager, scheduled jobs or real traffic. Previous DB restore to a second database did pass; separate-cluster disaster recovery is still pending.
- The test database uses \`push:true\` to generate Payload tables. Production requires reviewed migrations, non-owner DB identities and rollback drills.
- The project remains **draft stacked PR only**, no merge to \`main\`, no AWS billable resource created, no domain change.
