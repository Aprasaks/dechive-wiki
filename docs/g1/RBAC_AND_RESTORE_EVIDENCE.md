# G1 — Actor Separation and Backup/Restore Evidence

**Date:** 2026-11-03  
**Status:** G1-PARTIAL / PRODUCTION NO-GO  
**Scope:** DECHIVE.WIKI only. Synthetic fixtures, disposable GitHub-hosted PostgreSQL 17.6.

> **2026-11-03 extension:** Actual native Payload REST/GraphQL authenticated HTTP routes, JWT-enforced review and publication and draft isolation passed **38/38** additional checks. See [Native HTTP Auth Evidence](NATIVE_HTTP_AUTH_EVIDENCE.md). A complete deployed Next.js topology and durable individual-human approval signatures remain **NO-GO** blockers.

## Executed evidence

[Passing GitHub Actions run](https://github.com/Aprasaks/dechive-wiki/actions/runs/41624402509).

This run re-executed:

- **17/17** real loopback public HTTP and read-only PostgreSQL role checks.
- **8/8** SIGKILL process-fault, publication commit, outbox replay and stale-head protection checks.
- **18/18** database actor separation tests using three **separate authenticated PostgreSQL logins**.
- A fresh **pg_dump / pg_restore** round trip of **31 complete KG and Payload database tables**, including the new immutable approval audit.

All test assertions passed and the workflow completed successfully.

## Database authority model demonstrated

| Actor | Granted capability | Forbidden operation proven |
| --- | --- | --- |
| Editor probe | No KG access; CMS permissions remain a separate pending test | Cannot read revisions, self-approve or publish |
| Reviewer probe | Read revision and cited evidence; invoke one approval function | Cannot publish, edit approved claims or modify audit |
| Publisher probe | Execute the scoped publication coordinator | Cannot approve, read raw revisions or edit public head directly |
| Public reader | SELECT on approved public head/search views | Cannot read underlying revision evidence, approve or publish |

The approval function derives the *database account identity* from `session_user`; it does not accept an arbitrary reviewer name from the caller. The approval and immutable audit records are committed together, and duplicate approval is rejected. An unsupported revision is rejected by existing evidence-bound approval checks.

**Security note:** this trial uses a deliberately narrow `SECURITY DEFINER` function with a trusted search path and restricted execute grants. Its function owner is the test database owner and not the final non-superuser production service owner. Official guidance: https://www.postgresql.org/docs/17/sql-createfunction.html

## Fresh backup/restore round trip

The separate restored database's schema and full data content matched all **31** source tables. Approved public views, revision-bound search projection and public-reader restrictions remained intact. A marker inserted into the restored database did not appear in the source. The initial backup attempt failed because the host tool was PostgreSQL client 16 against a PostgreSQL 17 server; it was corrected to use a version-matched pinned PostgreSQL 17 image and retested successfully.

**Important limitations:**

- This restore took place in a *new database on the same PostgreSQL server*. Cluster-level role definitions were already available. A real **separate-cluster restore**, role/global-object export, secret rotation and DNS/application recovery drill remain untested.
- This is a database-login identity proof, **not** a real individual user's MFA, OAuth session, HTTP editor login, or human-reviewed citation verification.
- Default native Payload REST, GraphQL, version-restore/publish, scheduled jobs, server rendering and preview paths have not yet been tested against actual authenticated user sessions. Prior HTTP tests used a deliberately separate *public-only adapter*.
- Source evidence is deliberately synthetic; this test proves referential integrity and authorization, **not factual truth**.
- No cloud storage, object URL, CDN rights/takedown enforcement, or production backups have been exercised.
- Current CI schema uses a test privileged SQL owner. Before launch, create a dedicated limited schema owner and per-service roles, deny owner credentials to application connections, and test all escalation paths.

## Decision and next gate

**Continue G1 validation; DO NOT mark all of G1 as GO.** Next: real Payload REST/GraphQL/editor-reviewer authentication with least-privilege user identities and workflow signatures, then a separate-cluster restore and G3 rights HTTP/storage/CDN tests. Never merge a development spike as production deployment approval.

**Branches:** PR #9 is the HTTP/crash/restore baseline; the reviewer-role branch is stacked on top, still draft.
