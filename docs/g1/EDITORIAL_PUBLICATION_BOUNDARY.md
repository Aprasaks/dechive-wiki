# G1 — Payload Editorial Boundary vs. Canonical Public Knowledge

**Date:** 2026-11-03
**Status:** G1-PARTIAL / production NO-GO
**Environment:** ephemeral PostgreSQL 17.6 + Payload CMS v3.92.1 on GitHub Actions
**Scope:** DECHIVE.WIKI only; synthetic records, no real publication, no AWS compute

> **2026-11-03 extension:** 18 actor-identity permission checks and a 31-table PostgreSQL+Payload restore have since passed. Read [RBAC and Restore Evidence](RBAC_AND_RESTORE_EVIDENCE.md) for the full test matrix and important separate-cluster/real-user limitations.

## Canonical field and system ownership (v1.1 contract)

| Domain | Owner of record | Publicly accessible? | Rule |
| --- | --- | --- | --- |
| Editor working copy and autosave | Payload editorial collection | No | Drafts are internal only; even a Payload native `_status=published` cannot be treated as publication |
| Editorial workflow metadata | Payload (candidate) | No | Draft owner, review task, editor input; not a substitute for trusted editorial approval |
| Stable entity ID and kind | Knowledge Core / PostgreSQL | Yes, approved representation only | IDs are independent of URL, label, subject domain and locale |
| Typed relations and taxonomy | Knowledge Core / PostgreSQL | Only approved relations | Type/domain/range and DAG invariants must be enforced server-side |
| Claim, claim anchor, evidence | Knowledge Core / PostgreSQL | Only approved revision-specific claims | Support, dispute, uncertainty and source pinpoint are stored independently |
| Explicit publication approval | Knowledge Core / PostgreSQL | Public status only | Requires verified reviewer identity, audit log and non-bypassable role separation in future |
| Immutable published snapshot and head | Knowledge Core / PostgreSQL | Yes | A single approved head controls public read; no direct CMS preview fallback |
| Indexing / search projection | Knowledge Core outbox consumer | Yes, derived only | Stale or unapproved events cannot replace approved head |
| Rights review and media takedown | Rights service / Knowledge Core | Only permitted derivatives | No S3/CDN distribution before separate G3 proof |

## Executed acceptance result (2026-11-03)

**13/13 real Payload Local API + PostgreSQL checks passed in GitHub Actions.**

- [Passing run #41604273680](https://github.com/Aprasaks/dechive-wiki/actions/runs/41604273680) — exact pinned Payload v3.92.1 and PostgreSQL 17.6, Node.js 22.23.4, synthetic fixtures only.
- The 13 checks include a corrected guest-access assertion, create/update native publish refusal (including `draft:true` and `overrideAccess:true`), unauthorized mutation refusal, failed-approval protection, explicit rollback, approved public head, outbox search projection, and post-publication draft isolation.
- The first CI run was canceled after the test process did not exit; initialization markers, a bounded watchdog and an explicit clean exit were added, and the subsequent run passed 10 earlier checks. Before final acceptance the guest-access assertion was hardened to avoid accidentally catching its own assertion error, and three additional adversarial checks were added. The final 13-check run passed.

**Disposition: G1-PARTIAL PASS only.** REST/GraphQL and direct database actor separation remain mandatory.

## G1 HTTP and restricted database evidence (2026-11-03)

**17/17 additional tests PASS in an isolated Linux GitHub runner.** [Workflow evidence](https://github.com/Aprasaks/dechive-wiki/actions/runs/41607356561).

- A purpose-built public read adapter was reached through actual loopback HTTP requests. It exposes only approved knowledge, an approved-search projection, and an approved sitemap; the Payload editorial REST, GraphQL, preview, and admin routes are **not mounted on that public listener**.
- Its database session authenticated as a distinct `kg_public_http` role. Access to revision, claim evidence, approval insertions and publication/outbox functions was denied by PostgreSQL privileges, including when object identifiers were known.
- Query parameters such as `draft=true` could not expose private drafts. Approved HTTP results remained unchanged after editing the CMS draft.
- The SQL public-search view matches the active public head, exact revision and body. A deliberately poisoned stale search projection was hidden until repaired from the canonical outbox.
- Test-only database passwords were generated per workflow run; the role has no write rights or AWS access.

**Scope limit:** This is a deliberately minimal *public-only* HTTP adapter, **not** a deployed Next.js site or a security test of Payload's full native REST/GraphQL surface. Future G1 validation must use the actual application routing topology, sessions, role permissions and recovery behavior.

## G1 process-kill and outbox recovery evidence (2026-11-03)

**8/8 process-fault integration checks PASS, using genuine OS `SIGKILL` on a separate Node process in a real PostgreSQL 17.6 GitHub runner.** [Combined HTTP + crash run](https://github.com/Aprasaks/dechive-wiki/actions/runs/41609414714) also reran the 17 HTTP/RBAC checks (25 checks successful in that run).

- The test created an evidence-bound, explicitly approved synthetic revision and killed the publisher **after SQL publication but before transaction COMMIT**. No public head, immutable snapshot or outbox event survived.
- Retrying the publication committed one correct head and outbox event.
- Killing the search/outbox worker **after its SQL write but before COMMIT** left no partial projection or processed flag.
- Killing it **after COMMIT but before a client acknowledgement** preserved the index and processed marker. A redelivery was idempotent.
- Publishing the next approved revision immediately hid the previous stale search projection; replaying the older event afterward could not regress the approved search result.

**Limit:** This demonstrates PostgreSQL transactional durability under a killed worker and matching code paths. It is not a simulated power loss, database server restart, backup restore, real queue crash, or browser-to-production recovery test. The workers still use a test administrator DB connection. Production writer privileges and complete publication failure points remain open.

## Actually tested

G1 CI uses exact pinned Payload v3.92.1 and PostgreSQL 17.6, initializes a disposable database containing the same canonical Knowledge Core SQL migration set and a Payload editorial collection.

The experiment tests real Payload Local API and actual SQL transactions. It checks draft creation, guest editor-access checks, direct native publish bypass attempts (including `overrideAccess: true`), revision approval and rollback, outbox projection and isolation from later unapproved drafts.

**Key design choice:** a collection-level `beforeChange` hook rejects `_status=published` regardless of Local API access override. This is a defense at the CMS boundary, but not an immutable protection against direct SQL access or all version API flows. **Public exposure must still be exclusively from the Knowledge Core head and rights-gated public adapter.**

Official API caveat: Payload Local API defaults to `overrideAccess: true`; an access-control-only policy is insufficient. See https://payloadcms.com/docs/local-api/access-control .

## What the result does NOT establish

1. A loopback public read adapter has been exercised, but no actual Next.js or native Payload REST/GraphQL route has been exercised. HTTP requests with `draft=true`, preview sessions, caching, CORS, sitemap and SEO indexation may still leak content unless explicitly tested.
2. Payload's complete revision publish/restore operations and scheduled job paths have not been adversarially tested; version API or privileged database access might bypass the collection hook.
3. The test uses a privileged DB connection and fixture-only reviewer identity. DB roles, reviewer MFA identity binding, restrictive execution grants, audit trails and denial of direct table writes are unimplemented.
4. Isolated publisher/outbox worker processes were terminated with SIGKILL before/after COMMIT, and recovery/replay succeeded. Full application/server/DB instance termination, durable external queue relay, and restore from backup **have not** been tested.
5. No real source authentication, copyright review, external storage or CDN requests were involved.
6. Payload schema uses disposable dev `push: true`; production requires pinned, reviewed migrations and explicit schema ownership.
7. No AWS resources or paid APIs were provisioned by this test. Live account MFA is separate from the CMS permission model.

## Mandatory G1 exit gates before production

- [ ] CMS viewer/editor/reviewer roles with a real authenticated HTTP path and direct unprivileged DB role
- [ ] Bypass attempts across REST, GraphQL, Local API, version restore/publish, scheduled jobs and webhooks
- [ ] Publication coordinator that commits approved immutable KG revision and outbox atomically; no generic editor permission to write KG heads
- [ ] Process termination at each publication point and recovery/replay tests including stale messages
- [ ] Anonymous public endpoints, search, sitemap, RSS, cache and preview leak tests
- [ ] Reversible migration and data restore drills under actual deployed DB version
- [ ] Auditability of who approved which revision and why
- [ ] Clear sign-off to move G1 to GO

**Decision:** The integration contract is supported at the isolated Local API + database boundary only. Do not merge as a deployment release or claim the whole G1 gate is finished.
