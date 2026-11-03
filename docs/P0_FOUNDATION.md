# P0 Foundation — Architecture & Verification Gate

**Status:** PROPOSED / UNVERIFIED  
**Purpose:** Prove knowledge integrity, editorial publication safety, and reproducibility before building or deploying the public site.

## Working rules

1. This project is independent. Do not access, modify, or migrate unrelated properties or accounts.
2. Use isolated test resources. Never execute reference SQL against production.
3. Separate **CONFIRMED**, **PROPOSED**, and **UNVERIFIED** findings in every report.
4. No AI-generated content, private draft, or media asset becomes publicly accessible without an approved publication decision.
5. No unreviewed software stack, data model, or hosting contract should be treated as final.
6. Do not commit credentials, secret environment values, account data, or third-party copyrighted content.

## P0 deliverables

| Gate | What must be demonstrated | Status |
| --- | --- | --- |
| G0 — Asset boundaries | Independent repository, service inventory, AWS account/resource isolation and cost envelope | UNVERIFIED |
| G1 — Ownership & publication | Field ownership matrix; canonical approved revision; immutable snapshot; publish/outbox rollback and recovery tests | UNVERIFIED |
| G2 — Data integrity | Taxonomy DAG cycle prevention under concurrent writes; relation domain/range validation; symmetric deduplication; evidence tied to specific revisions | UNVERIFIED |
| G3 — Sources & rights | Claim-level provenance, contradictory evidence, media rights enforcement, and takedown controls | UNVERIFIED |
| G4 — Locale model | English-only public content with stable language-independent identities and future locale fixtures | UNVERIFIED |
| G5 — Reproducible stack | Exact version pins, repeatable migrations, and isolated staging integration tests | UNVERIFIED |
| G6 — Security & recovery | Least privilege, draft leakage tests, backups, restore drill, rollback and documented recovery objectives | UNVERIFIED |
| G7 — Pilot quality | Small mixed-type knowledge set, cross-domain journeys, disambiguation and representative search queries | UNVERIFIED |

## Required technology comparison

Evaluate the **same representative mixed-type fixtures** in:

1. A custom PostgreSQL knowledge model.
2. The Wikibase statement model.

Compare referential integrity, typed relationships, evidence/provenance, editing ergonomics, portability, operational workload, licensing, and monthly cost. Record the decision in an Architecture Decision Record (ADR) before selecting an implementation.

## First acceptance tests

- Simultaneous taxonomy edits cannot produce cycles.
- Symmetric relations (A ↔ B) have one canonical identity.
- Invalid relation subject/object types are rejected.
- Multiple sources can support or dispute a claim or relationship.
- An approved claim points to an exact published revision and stable section/claim ID.
- Substantive edits invalidate prior verification until reviewed.
- Draft and unapproved data never reach public API, search, sitemap, or cache.
- A failed publish cannot leave inconsistent public state; rollback/replay is safe.
- Unlicensed or unknown-rights media cannot be delivered via public URL/CDN.
- The system can restore its test data and publishing state after a simulated failure.

## First coding order

1. Inventory inputs and establish an isolated development environment.
2. Write a field-level ownership matrix and an explicit data contract.
3. Produce representative entity, relation, source, and publication fixtures.
4. Implement database integrity experiments and run failure/concurrency tests.
5. Compare Wikibase with the same fixtures.
6. Record outcomes, resource cost, performance, and unresolved risks.
7. Request a **GO / NO-GO** review for the next implementation phase.

## Out of scope until P0 passes

- Production AWS provisioning or DNS changes
- Publicly deployed wiki or editable user accounts
- Bulk crawling and content import
- Autonomous public publishing
- Mass-produced AI articles
- Paid API commitments beyond an approved test budget

**Completion criterion:** evidence-backed test results, not just code or a visually polished interface.
