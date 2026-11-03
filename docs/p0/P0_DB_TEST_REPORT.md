# P0-DB-001 — Isolated PostgreSQL Knowledge-Core Spike

**Date:** 2026-11-03
**Repository:** `Aprasaks/dechive-wiki`, branch `p0/knowledge-core-spike-001`
**Scope:** independent, synthetic-only PostgreSQL 17.6 experiment.
**Decision:** **PARTIAL PASS** for executable data-contract tests. **NO-GO** for production / public beta.

## Reproduction command

On a Docker-enabled developer machine with Python 3:

```sh
./scripts/run-p0.sh
```

The script refuses an existing container without the exact `dechive.wiki.scope=p0-isolated` label, then replaces **only** its own disposable test container. It uses an in-memory tmpfs, `--network none`, no published TCP ports, and a content-addressed local PostgreSQL image. No AWS, user account data, production services, paid APIs, or outside content sources are contacted.

**Observed result:** New container + all three ordered migrations + **19 distinct database tests PASS**, `Ran 19 tests ... OK` and shell exit code 0. The tests were executed on an actual PostgreSQL container, including separate concurrent `psql` processes. Barrier-coordinated race tests repeated the category-cycle case four times for each shape.

## Evidence matrix

| Contract / original test | Evidence | Result / limitation |
| --- | --- | --- |
| G2 / P0-020 | `test_01_taxonomy_cycle_blocked` | PASS: A→B→C→A rejected |
| G2 / P0-021–022 | `test_p0_concurrency` | PASS: two-process 2-edge and 3-edge races; 4 repetitions each |
| G2 / P0-023 | `test_04_multi_parent_allowed` | PARTIAL: multiple parents and permanent category ID; reparenting workflow not implemented |
| G2 / P0-024 | `test_05_symmetric_duplicate_concurrent` | PASS: reverse symmetric edge deduplicated by canonical order + unique constraint |
| G2 / P0-025 | `test_06_invalid_typed_relation_blocked` | PASS: declared subject/object constraints |
| G2 / P0-026 | `test_07_relation_support_and_contradiction_retained` | PASS: independent supportive/contradictory source rows; actual factual veracity not tested |
| G1 / P0-010 | `test_10_public_snapshot_ignores_new_draft` | PARTIAL: DB view excludes unapproved later draft; no CMS/HTTP/search endpoint |
| G1 / P0-014 | `test_13_two_publishers_cannot_both_win`, barrier test | PASS: one approved publication head wins; loser fails compare-and-swap |
| G1 / P0-015 | `test_14_outbox_replay_cannot_resurrect_older_version` | PASS: old outbox event ignored after newer projection |
| G1 / P0-012 | `test_15_transaction_rollback_leaks_nothing` | PARTIAL: explicit rollback proven; no kill/restart fault injection |
| G1 / P0-017 | `test_11_frozen_revision_and_claims` | PASS: immutable revision and claims after approval; complete durable artifact store untested |
| G2 / P0-027 | `test_09_approval_rejects_mismatched_text` | PARTIAL: claim must appear in exact revision body; semantic-change reviewer workflow unimplemented |
| G3 / P0-040,043 | `test_12_rights_gate_and_takedown_view` | PARTIAL: rights block and live read-view revocation; S3/CDN/HTTP unavailable |
| G3 / P0-044 | `test_08_unapproved_revision_never_public` | PARTIAL: unapproved draft blocked; genuine source verification untested |
| G4–G5 | Rebuild runner, English-only revision constraint | PARTIAL: DB migration reproduction shown; Next/Payload compatibility untested |
| Isolation | Docker inspect | PASS for this run: network `none`, no ports, only synthetic fixtures |

## Important limits and unproven claims

- **Not production-grade.** Root-role test connections have broad database privileges. Database access controls, separate writer roles, and public read API security were not tested.
- **No actual CMS.** Payload access, editor permission bypass, atomic cross-system publication, and outbox durability under process crash remain unverified.
- **No live rights check.** The rights test is a *SQL view*; it does not establish S3 ACL, presigned URL, CDN invalidation, or copyright legal clearance.
- **Synthetic sources only.** `urn:synthetic:...` is intentionally a test placeholder; this exercise does not verify real-world facts.
- **Wikibase comparison not run.** Do not select a production knowledge engine until the identical-fixture Wikibase experiment is completed and recorded in an ADR.
- **No account, billing, domain or DNS changes.** AWS deployment and production budgets remain NO-GO.
- **Locale:** English-only publishing was constrained in this proof; full multilingual future model is proposed, not implemented.
- **Known test-scoped tradeoff:** Taxonomy writes fail closed under `REPEATABLE READ` instead of claiming unsupported concurrency guarantees. A production database must enforce its configured transaction policy, and privileges must prevent bypasses.

## Actual fixes found during execution

1. The prototype initially used the PostgreSQL reserved term `symmetric` for a column, causing its migration to fail. Changed to `is_symmetric` and reran the migration successfully.
2. Initial test discovery used an outdated projection table name. Updated the tests and reran all tests.
3. A second test module initially imported a `unittest.TestCase` class into its namespace, causing test discovery to count duplicate tests. Replaced the import and confirmed **19 unique** passing tests from a rebuilt container.

These corrections are part of the evidence trail, not hidden behind a passing claim.

## Next required checkpoints before expanding implementation

1. **G0:** independent repository, AWS principal and least-privilege service boundary, numeric budget ceiling, account/domain/DNS inventory.
2. **G1:** Payload proof with direct publish bypass rejected, process-crash publication recovery and outbox replay, audited human action.
3. **G2:** Wikibase statement model on the same 12 mixed-type fixtures; bibliographic work/edition/periodical correctness; category reparenting and merge/split.
4. **G3:** actual private-object / storage / CDN rights gate; license/takedown evidence; real traceable primary sources.
5. **G5–G6:** clean restoration from backup, migration rollback, identity/RBAC and security tests.

No production deployment, DNS change, or automated public publishing is authorized by this result.
