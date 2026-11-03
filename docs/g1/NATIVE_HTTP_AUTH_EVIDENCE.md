# G1 — Native Payload HTTP Authentication, Review and Publication Proof

**Date:** 2026-11-03  
**Status:** G1-PARTIAL PASS / deployment NO-GO  
**Environment:** GitHub Actions Ubuntu 24.04; pinned Node.js 22.23.4, Payload v3.92.1, @payloadcms/next v3.92.1, Next 16.4.4 and PostgreSQL 17.6.  
**Evidence:** [Final 38/38-run](https://github.com/Aprasaks/dechive-wiki/actions/runs/41646682766).

## What was truly executed

A Node.js loopback HTTP server forwarded real TCP requests to Payload's **actual Next REST_GET/REST_POST/REST_PATCH/... and GRAPHQL_POST route handler functions**. This is not a mock of Payload's API or invented GraphQL schema; it uses the native route implementation, JWT authentication and generated collection access rules. It does **not** invoke the full Next.js request lifecycle in a deployed Next.js server.

The test seeds four synthetic authentication-enabled \`staff\` accounts (two editors, one reviewer, one publisher) with randomly generated passwords. It logs in through the actual \`/api/staff/login\` HTTP endpoint, uses returned signed JWTs, and tests both real REST and actual generated GraphQL operations.

The proof also mounts two **real Payload custom REST endpoints**:

- \`POST /api/g1-approve\` — requires a signed reviewer JWT. It reads the actual Payload draft via access-controlled Local API, compares both its stable entity ID and **exact body text** to the immutable PostgreSQL revision, then calls an approval function using a *separate restricted reviewer database login*. The Knowledge Core's evidence-bound approval triggers remain authoritative. A second approval attempt is denied.
- \`POST /api/g1-publish\` — requires a signed publisher JWT. It calls the exact Knowledge Core publication coordinator using a *separate restricted publisher database login* with no ability to read or alter underlying revision tables. The DB denies an unapproved revision or a stale expected version.

The public API remains a separate, least-privilege **approved-read-only** endpoint: \`/v1/entries/:id\`. It cannot retrieve the new private editor draft even when a \`draft=true\` query is supplied.

## Tests and verified outcomes

**38/38 assertions passed:**

- Actual editor/reviewer/publisher login; incorrect password denied; anonymous staff registration denied; editor cannot self-promote or impersonate reviewer.
- Anonymous REST and second-editor REST cannot read guessed document IDs, private listings or deep draft previews.
- Reviewer may read submitted draft, but cannot modify it; publisher cannot submit arbitrary editorial drafts.
- Native CMS \`_status=published\` update returns explicit 403, not HTTP 500. The document remains draft.
- Anonymous and reviewer native version-restore attempt denied; reviewers cannot enumerate native revision history.
- Generated GraphQL accepts authenticated reviewer read and editor's private update, and refuses anonymous/other-editor reads, reviewer edits and editor GraphQL direct-publication attempts.
- Review approval is denied to guests, editors and publishers; a reviewer cannot approve a revision whose entity ID or content differs from the actual draft.
- Publication is denied to editors/reviewers, denied before approval, accepted for publisher after evidence-bound approval and denied upon stale-version replay.
- The public Knowledge Core head equals the exact originally approved content after later REST or GraphQL draft changes.
- Logging out via native Payload REST invalidates the publisher JWT; privileged publisher endpoint refuses its reuse.

## Specific limitations and release blockers

1. **No deployed Next.js server.** The test uses actual Payload Next route handlers bridged over loopback HTTP, not the complete Next.js runtime, middleware, CSRF handling, proxy headers, SSR/server components, caching or production routing.
2. **Human identity attribution not final.** HTTP reviewer and publisher roles are JWT-authenticated, but the KG approval audit records the *database service login*, not the stable individual staff identity. A durable, atomic per-reviewer signature/audit binding and access revocation policy remain to be designed and attacked.
3. **No live independent source validation.** Canonical KG entities, sources, citations and claims are synthetic and inserted by test setup. The authenticated reviewer checks the revision-to-draft text binding; the experiment does **not** prove that the cited statements are factually correct or that their rights are cleared.
4. **No production deployment or secret management.** All credentials were generated locally in the isolated runner or hard-coded as explicitly synthetic CI-only values. No real user accounts, AWS resources or domains were used.
5. **Version APIs not exhaustively attacked.** Anonymous and reviewer restore denial was verified. Editor-owned restore and all native scheduled publication/job/preview paths require further checks under the real application topology.
6. **No separate-cluster backup/restore, media rights, CDN invalidation or legal takedown test.** Prior backups restored the complete database to a *second database on the same ephemeral PostgreSQL server*, not a separate cluster.

## Design and production implications

Keep **Payload as a private editorial workspace only**. Do not expose Payload editorial REST/GraphQL directly to anonymous readers in the product. Public articles and search must be projected from the immutable, approved Knowledge Core head, with rights checks applied to media. The actual production editor session and human approval identity must be independently auditable. Move the disposable \`push:true\` schema toward reviewed SQL migrations and scoped non-owner service roles before any deployment.

**Decision:** G1 remains **PARTIAL / production NO-GO** despite successful isolated real Payload HTTP tests. The PR must remain a draft and must not merge to \`main\` as a release. No paid AWS workload was created.

Official documentation used to select the real API surfaces: [Payload REST API](https://payloadcms.com/docs/rest-api/overview), [Payload GraphQL](https://payloadcms.com/docs/graphql/overview), [Collection Access Control](https://payloadcms.com/docs/access-control/collections), [Payload Versions](https://payloadcms.com/docs/versions/overview) and [Authentication](https://payloadcms.com/docs/authentication/overview).
