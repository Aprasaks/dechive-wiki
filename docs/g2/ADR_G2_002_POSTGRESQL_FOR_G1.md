# ADR G2-002 — Select PostgreSQL for the Next Knowledge-Core Integration Proof

**Date:** 2026-11-03
**Status:** ACCEPTED FOR THE NEXT PROOF ONLY / PRODUCTION NO-GO
**Project:** DECHIVE.WIKI (independent)

## Decision

Use the **custom PostgreSQL knowledge-core prototype** as the candidate authoritative store for the next Payload CMS and publication-boundary integration test (G1).

Keep **Wikibase support as a deferred interoperability/import option**. Do not install the full Wikibase Suite as the primary production architecture without a separate demonstrated reason.

This decision is about which prototype to test next, **not a final infrastructure commitment**.

## Verified evidence

1. PostgreSQL 17.6: 25 tests covering version-bound claims, invalid typed relations, cycles/races, approval snapshots, rights flags, outbox replay and a 12-entity mixed knowledge fixture passed.
2. Wikibase 8.1.2's real HTTP API: 12 Q-items, 11 statements, 12 references, two qualifiers, Q/P entity edits and server revisions round-tripped on an ephemeral, isolated GitHub-hosted Linux environment.
3. Direct adversarial observation: the uncustomized Wikibase API accepted a relationship outside our declared subject/object rules. PostgreSQL blocked the corresponding invalid relationship in its database prototype.
4. Direct publication observation: an authenticated Wikibase edit became readable anonymously. This alone is not an approved, immutable public publication workflow.

Evidence:
- [PostgreSQL contract run](https://github.com/Aprasaks/dechive-wiki/actions/runs/41590007073)
- [Live Wikibase graph run](https://github.com/Aprasaks/dechive-wiki/actions/runs/41595063143)
- [G2 detailed report](../g2/LIVE_WIKIBASE_EVIDENCE.md)

## Reasoning

DECHIVE.WIKI's core promise is not simply storing relationships. Each public claim must have precise provenance, an approved revision, rights clearance and an auditable history. PostgreSQL provides database-enforced integrity and a deliberately narrow publication boundary in our actual tests. It integrates with the planned CMS-facing editorial workflow without inheriting Wikibase's public-edit semantics.

Wikibase represents statements, references and qualifiers very well. However, meeting our hard constraints would involve custom validation, editorial publication gating and operational integration with additional Wikibase Suite services. Those additional mechanisms have not been demonstrated.

## Conditions and non-decisions

- Do **not** mark G1 complete until a real CMS proves it cannot bypass the approved public snapshot.
- Do **not** mark G3 complete until real object storage/CDN paths block unlicensed media, including after takedown.
- Do **not** deploy to production until account privileges, recovery, bills and security are verified.
- The exact physical schema, table owners, root category model, stable URL contract, search strategy and versioned API are still provisional. Build only on verified invariants.
- All experiments used synthetic records. No primary-source verification of real articles has happened.
- No comparative latency, full Wikibase Suite cost, or query-service benchmarks have been run.

## Exit conditions for reconsideration

Re-evaluate Wikibase as a possible canonical system only if new evidence demonstrates lower complexity or better long-term integrity **while passing the same hard relation, claim, approval, rights, and recovery tests**. Do not change the authoritative system based on a visual demonstration or the number of built-in features alone.

## Next authorized work

G1 proof: disposable Payload CMS + PostgreSQL integration; field-level ownership; unapproved CMS publication bypass rejection; immutable public snapshot; crash and outbox recovery. This remains a staging-only experiment until all relevant gates pass.
