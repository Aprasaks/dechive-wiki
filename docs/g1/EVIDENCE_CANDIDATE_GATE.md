# G1 — Editor Evidence Candidate Intake: Signed, Atomic, Non-Publishable

**Execution date:** 2026-11-03  
**Status:** Candidate intake experiment PASS; **G1 production NO-GO**.  
**Basis:** DECHIVE.WIKI only; synthetic CI users, sources and claims.

## Implemented

The private Studio editor can attach a source URL, description, a claim quoted verbatim from the draft, pinpoint and self-declared license. Source URL and license are NOT independently verified. HTTPS source URLs are stored but never fetched by this experiment.

The real editor JWT and document ownership are checked through Payload. The backend—not the browser—loads the exact draft body/title/entity ID and creates a fresh immutable revision ID. A dedicated restricted PostgreSQL role can only execute a scoped candidate submission function, not read KG private tables or approve/publish anything.

The backend signs a stable hashed envelope of exact candidate metadata with an ephemeral HMAC key. PostgreSQL checks the signature, validates an editor staff role and transactionally inserts the entity, revision, canonical source, claim, editor-asserted claim evidence and candidate metadata in one atomic operation. Source and rights review default to PENDING.

A database approval trigger refuses all candidates in this phase, including a direct attempt by the test schema owner. A publisher cannot publish unreviewed candidate revisions. The public SSR knowledge and sitemap endpoints remain isolated from private candidate data.

## Evidence: 80 tests passed

[GitHub Actions run #41660865631](https://github.com/Aprasaks/dechive-wiki/actions/runs/41660865631) completed SUCCESS.

- 57/57 real Next.js development server HTTP and database boundary assertions, including 13 new source-candidate authorization and no-publication tests.
- Optimized Next.js production build with TypeScript checks PASSED.
- 13/13 compiled production server smoke checks.
- 10/10 actual Google Chrome browser UI checks, including clicking source submission and verifying it never appears publicly.

The tests rejected forged HMAC messages, unsigned/direct KG read or publication attempts from the candidate role, other-editor submission, non-HTTPS/missing source URLs, unsupported claims, reviewer approval bypass, publisher publication bypass and duplicate submissions without partial writes.

## Still unverified / production blockers

1. An editor can submit an imaginary .invalid source URL. No real primary-source reading, title/author matching, external web requests, claim truth-check or quotation rights verification has taken place.
2. The claim-evidence stance is explicitly editor-asserted, not independently verified. The candidate CANNOT be approved until a future reviewer-owned source and rights decision flow is built.
3. The editor's license selection is an unverified declaration; no copyright status is established and no media or external document is stored.
4. This proof accepts only one initial candidate per draft and one anchored claim. Revision resubmission, rejection, multiple claims and multi-source support/dispute flows are not yet implemented.
5. Reviewer UI is currently a private draft viewer, not a complete source authenticity or rights clearance workspace; no approve/reject control for this candidate was added.
6. The ephemeral shared HMAC and schema-owner-controlled PostgreSQL test account are not production secret custody or independent human approval.
7. Real HTTPS delivery, audited Payload migrations, cross-cluster recovery, production role ownership, scheduled job/version-restore bypass, and public web security remain release blockers.

**Decision:** G1 candidate intake PASS in isolated CI. G1 overall and public operation remain NO-GO. Do not merge an experiment as a release. No edits to the default GitHub branch, AWS resources, DNS or real users were made.

**Next gate:** independent source and license review, recorded rejection/approval, then authorized release only for fully verified immutable versions.
