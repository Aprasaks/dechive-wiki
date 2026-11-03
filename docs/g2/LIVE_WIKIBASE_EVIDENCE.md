# G2 — Actual Wikibase vs PostgreSQL, Synthetic Knowledge Graph

**Date:** 2026-11-03
**Status:** Executed against both PostgreSQL and a real Wikibase HTTP API. Production platform selection is **conditional**, not an authorization to deploy.

## Reproducible evidence

- PostgreSQL: GitHub Actions and local PostgreSQL 17.6; 25/25 contract tests pass, including synthetic 12-entity import, typed relation checks, references and qualifiers.
- Wikibase: [GitHub Actions run 41595063143](https://github.com/Aprasaks/dechive-wiki/actions/runs/41595063143), success.
- Official pinned container images: Wikibase Suite's Wikibase web image 8.1.2; MariaDB 10.11. Both image digests recorded in `experiments/wikibase/compose.yml`.
- Runner: ephemeral GitHub-hosted Linux x86, localhost-bound Wikibase HTTP endpoint, randomly generated test-only passwords, Docker volumes destroyed after the job.
- **This is a two-container core Wikibase API experiment, not the full Wikibase Suite installation.** It omits WDQS, job runner, OpenSearch, Traefik, and full production networking.

## Identical test fixtures

Source: `fixtures/g2/mixed_12.json`. All data is made up for this test; no real-world truth has been established.

| Requirement | PostgreSQL run | Actual Wikibase run |
| --- | --- | --- |
| 12 knowledge entities across 9 types | 12 UUID entities inserted | 12 Q-items minted and retrieved |
| 11 typed semantic relations | 11 validated rows | 11 actual Wikibase statements written/read |
| 12 support/contradiction references | 12 provenance rows | 12 Wikibase statement references written/read |
| 2 relation qualifiers | 2 rows in qualifier table | 2 actual qualifier snaks written/read |
| Label / concept identity change | Immutable revision prototype | New MediaWiki revision observed |
| Wrong subject/object relation | Hard failure by PostgreSQL trigger | **Accepted** by uncustomized Wikibase API |
| Unapproved public content | Database public-head gate demonstrated | **Immediately readable anonymously** once an editor writes it |
| Concurrency, publication rollback | Experimental PostgreSQL tests pass | Not evaluated in real Wikibase deployment |
| Search, batch editing, export/restore, performance | Not fully tested | Not tested |
| Full operational complexity | One PG test container | Two-container partial trial only, full Suite not tested |

Distinct relation properties in Wikibase: 10. Also 2 qualifier properties and 3 string-based reference properties.

## Observed behavioral differences

1. **Domain/range integrity.** Wikibase property datatype `wikibase-item` alone does not enforce the application's relationship rules. The real API accepted a relation connecting disallowed subject/object types. A separate validation and review layer would be required before treating these statements as authoritative.
2. **Publication boundary.** An authenticated Wikibase editor's new item was already readable anonymously. Wikibase does retain MediaWiki revision history, but this is **not** DECHIVE.WIKI's required separate approved and immutable public snapshot gate.
3. **Evidence format.** Wikibase genuinely stores statement references and qualifiers, including contradictory stance metadata. This confirms representation, not proof of the source's factual correctness.
4. **Complexity.** The trial proves a real Wikibase core API can run without paid AWS compute in GitHub CI; it **does not** validate the official production suite's x86/8GB/domain/query-service installation requirements.
5. **Resource snapshot.** A single GitHub Actions sample reported roughly 77 MiB for the Wikibase container and 342 MiB for MariaDB. It is **not** a sizing measurement under actual workload or of the complete Suite.

## Evidence-based recommendation (provisional)

**Continue the DECHIVE.WIKI knowledge core proof with PostgreSQL as the authoritative data-contract candidate; keep Wikibase as a possible import/interop adapter, not an approved canonical store.**

Why: the business invariant is an approved, revision-specific and rights-aware public representation. Custom PostgreSQL hard constraints and a separately approved public-head/outbox pattern have executable tests. The Wikibase core excels at flexible statements, qualifiers, references and revisions, but matching our publishing and typed-relation requirements would require extra guards.

This is a **conditional engineering direction**, not a production GO. Do not skip:
- G1 CMS bypass and atomic publish/outbox recovery tests
- G3 real storage/HTTP/CDN media rights and takedown tests
- IAM non-root privileges and application identity proof
- Real source verification, search relevance, recovery, and cost tests
- A full suite operational benchmark if choosing Wikibase as a future primary engine

## Runbook

1. On the branch, edit `fixtures/g2/mixed_12.json` with *synthetic* fixtures only.
2. The `G2 Real Wikibase API Spike` GitHub Action starts a disposable Wikibase + MariaDB pair and calls `tests/g2_wikibase_live_api.py`.
3. The `P0 PostgreSQL Contract Tests` workflow recreates PostgreSQL and checks `tests/test_g2_mixed_fixture.py` alongside the prior data-contract tests.
4. Store actual logs and failures, not only a narrative conclusion. Do not port the benchmark into production.
