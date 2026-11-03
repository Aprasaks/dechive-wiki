> **Historical baseline (superseded 2026-11-03):** This document predates the successful real Wikibase API test. For current execution evidence and findings, see [Live Wikibase Evidence](LIVE_WIKIBASE_EVIDENCE.md).

# G2 — Shared 12-Entity Comparison: Baseline Report

**Date:** 2026-11-03
**Decision:** PARTIAL PASS (PostgreSQL executed, Wikibase format mapped offline). **Engine selection remains OPEN.**

## Synthetic, not facts

The fixture is deliberately invented. It is not an archive of verified external knowledge.

Input: fixtures/g2/mixed_12.json.

Entity coverage: concept (2), person (2), research paper (2), book work (1), edition (1), periodical (1), issue (1), periodical article (1), event (1). Total **12 entities** spanning 9 types and multiple knowledge domains.

Graph coverage: 11 typed relationships; 12 provenance records including both a supporting and a contradicting reference for one relation; 2 qualifiers. Sample pathways include Book Work → Edition, Periodical → Issue → Article, Research Paper → Concept, Event → Concept.

## What was actually executed

1. PostgreSQL schema migrations 001–004 were applied to a fresh isolated PostgreSQL 17.6 container.
2. All 12 entities, 11 relations, 12 references, and two qualifiers were imported into real PostgreSQL tables.
3. Typed relational constraints were tested using positive and invalid input.
4. A canonical-Wikibase-style Action API JSON representation was **generated in memory and structurally tested offline** (labels, item IDs, statements, references, qualifiers, ranks).
5. The original 19 PostgreSQL integrity tests were rerun alongside six G2 tests.

**Observed:** 25 distinct automated tests PASS, process exit code 0 in local PostgreSQL.
**Not observed:** Any Wikibase Suite deployment, HTTP API write/read, query service performance, or data restore.

## Side-by-side status

| Capability | Custom PostgreSQL experimental result | Wikibase status |
| --- | --- | --- |
| Stable entity identity | UUID keys demonstrated | Q identifiers structurally mapped; real QID minting not tested |
| Nine mixed entity types | 12 rows inserted | 12 item payloads mapped offline only |
| Typed relations | DB domain/range violations rejected | Need to prove server-side hard enforcement (warnings alone not enough) |
| Contradictory evidence | Two reference stances preserved | Both references represented in JSON; server behavior untested |
| Qualifiers | Two qualifiers inserted and queried | JSON qualifier model supports representation; API accept/write untested |
| Edition/periodical structure | Basic typed edges tested | Item/property statements mapped; semantics/constraints untested |
| Concurrent writes | Existing PG integrity tests pass | Not tested |
| Claim/version-specific validation | Basic immutable revision prototype | Not tested with actual wiki revisions |
| Editorial release gate | DB-only prototype, not CMS integration | Not tested |
| Search/index/recovery | Not tested in comparative dataset | Not tested |
| Resource/operating cost | Local ephemeral container, no AWS charges | Real cost not measured |

## Specific Wikibase constraints and deployment prerequisites

Wikibase Suite's official self-hosting installer currently describes a server with a **public IP, x86 architecture, at least 8 GB RAM and 4 GB storage**, plus **domain and query-service subdomain**. Production Suite is not intended to be installed locally on the current developer Mac.

This means a paid ephemeral x86 deployment requires explicit budget and DNS/security planning before a production-like comparison. Wikibase Suite development tooling does exist, but is not equivalent to verifying supported production behavior.

Official references:
- https://github.com/wmde/wikibase-suite/blob/main/docs/install/installer.md
- https://www.mediawiki.org/wiki/Wikibase/DataModel
- https://doc.wikimedia.org/Wikibase/master/php/docs_topics_json.html

## Decision criteria for actual engine selection

The next G2 benchmark must import the same fixture set into a pinned real Wikibase instance, then perform real HTTP/API reads and writes. It must measure: identity mapping, relation validation bypass attempts, source reference editing, qualifier round trips, query paths, operational overhead, deployment isolation, DB migration strategy, backups/recovery and numeric monthly cost. If hard constraints require custom plugins, include their long-term maintenance burden.

**Current architecture outcome:** PostgreSQL remains the better-evidenced experimental candidate, but neither PostgreSQL nor Wikibase is approved as the final production knowledge engine.
