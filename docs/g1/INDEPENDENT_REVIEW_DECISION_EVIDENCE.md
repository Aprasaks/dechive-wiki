# G1 — Independent Human Reviewer Decision and Rights Gate

**Date:** 2026-11-04 (Asia/Seoul)  
**Scope:** DECHIVE.WIKI only, disposable GitHub Actions PostgreSQL 17.6, Payload 3.92.1, Next.js 16.4.4, English-first.  
**Decision:** Isolated review decision gate PASS; overall G1 and real production operation remain **NO-GO**.

## Executed evidence

[Final successful GitHub Actions run #41756901523](https://github.com/Aprasaks/dechive-wiki/actions/runs/41756901523).

- **70/70** real Next.js development-server HTTP and PostgreSQL security/integrity assertions.
- **Optimized Next.js build and strict TypeScript passed.**
- **13/13** compiled Next.js production-mode HTTP assertions with next start.
- **11/11** actual Google Chrome browser interactions, including staff login, source submission, private visibility, independent review UI and permanent rejection.
- **94/94** assertions total across all three test groups. A synthetic screenshot artifact is available in the passing GitHub Actions run.

A prior attempt detected an incomplete UUID matcher in the reviewer API, then an outdated reviewer-UI title assertion. Both were corrected and retested. No result is claimed from a failed or cancelled run.

## New implementation

A new immutable table stores one independent decision per candidate revision:
reviewer staff ID; immutable revision SHA-256 checksum; accepted/rejected outcome; source-verdict and rights-verdict; written rationale; nonce, HMAC and timestamp.

The reviewer HTTP handler validates the authenticated Payload reviewer identity and sends an HMAC-bound decision to a separate, restricted reviewer PostgreSQL login. The database independently checks the reviewer's role, that they are not the editor who submitted the candidate, the signature over all decision fields, the revision checksum and the editor-declared license category. The reviewer login cannot directly update decisions or its signing key. Decision records reject UPDATE/DELETE and duplicate INSERT.

The reviewer workspace now shows the editor-submitted claim, source locator and pinpoint (which may be fake), declared license, and immutable pending status. It includes distinct **Reject candidate**, **Record independent acceptance**, and (after acceptance) **Separately approve reviewed revision** controls. A source locator is rendered only as an external link with noreferrer/noopener; it is not fetched by the application. Only the reviewer role gets this UI and underlying API access.

A new database approval guard permits a candidate's approval **only after** a prior signed independent review decision with source=verified, rights=cleared and matching revision checksum. Declared unknown or permission-required rights cannot be accepted through this initial text-only workflow. Reviewer acceptance does **not** itself create an approval, public head, outbox event or sitemap entry; separate reviewed-revision approval and publisher service release remain mandatory.

**Rejected** candidates cannot be approved, published, silently changed or re-accepted. The candidate's existing claim and evidence records are frozen after submission, not only after approval. Correction will require a new immutable candidate in a subsequent gate.

## Verified attack paths

- Guests, editors and publishers cannot list private candidates or create reviewer decisions.
- Malformed/forged revision identifiers, insufficient review notes, unverified source evidence, and uncleared rights do not produce a positive review decision.
- Reviewer DB role cannot forge the signed decision.
- Editor-declared rights=unknown cannot be promoted to accepted simply by sending source=verified and rights=cleared.
- Rejection is permanent for that revision; signature replay, direct row update, approval or publication fail closed.
- Candidate claim/evidence cannot be changed behind the reviewer's back.
- Accepted decision alone cannot publish; the two additional authenticated approval/publisher steps are required.
- Approved synthetic fixture appears in public SSR and sitemap only after those steps; rejected fixture remains 404.
- Actual Chrome launches, logs in as a reviewer, opens the evidence queue and records a rejection; acceptance remains disabled for unknown-license fixture.

## Important boundary / what this does NOT prove

1. **No automated factual verification.** The accepted positive-path test deliberately uses **synthetic** data and has a reviewer account assert that the fictional source and rights were inspected. This proves the process enforces explicit human decisions and signed audit attribution, **not** that a real source supports a statement.
2. **No legal licensing decision.** A human-declared public-domain or CC BY license is not independently verified. For real documents, rights evidence, author attribution, regional copyright restrictions, document provenance and quotation permissions need separate verification before launch.
3. **Not an individual cryptographic signature.** The HMAC is created by a trusted application server from an authenticated user ID and a shared ephemeral CI signing key. If that application or privileged PostgreSQL owner is compromised, the process is not independently non-forgeable.
4. **One claim and one source per candidate.** The earlier candidate gate still allows one candidate per draft; robust multi-source contradictions, reviewer correction cycles, new candidate resubmission, source conflict and actual rights attachments are missing.
5. **Not a production operator deployment.** Test-only schema push, CI PostgreSQL superuser function owner, HTTP loopback, no real HTTPS/reverse proxy/managed secret custody, no separate-cluster recovery, no real production browser access.
6. **Public storage/media and rights takedown** have not been exercised. The new gate only covers text-based article candidate metadata.

## Release control

This work remains a **stacked Draft PR**, not merged into main and not deployed. No AWS compute/storage charges, DNS, production databases or real user accounts were changed.

**Next recommended gate:** reviewer correction/resubmission of new immutable versions, multi-claim/multi-source support/dispute with reviewer evidence verification, and rights documentation; followed by secure deployment preview and operational security/recovery reviews.
