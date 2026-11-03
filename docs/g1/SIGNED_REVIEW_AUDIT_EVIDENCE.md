# G1 — JWT Reviewer Identity and Signed Revision Attestation

**Date:** 2026-11-03  
**State:** Real integration proof passed; production remains NO-GO  
**Scope:** DECHIVE.WIKI independently; isolated GitHub Actions runner, synthetic staff accounts and synthetic citation fixtures only.

## Verified execution

[Final 42/42 successful integration run](https://github.com/Aprasaks/dechive-wiki/actions/runs/41650655877) verified the real Next.js 16.4.4 App Router development server (**31/31 HTTP/security checks**), compiled an optimized production build with strict TypeScript enabled, and ran **11/11 checks** against the actual built \`next start\` server.

The seven additional development-server assertions prove:

1. A restricted reviewer database login cannot read the private HMAC signing key in the PostgreSQL \`kg\` schema.
2. The original unsigned \`kg.approve_revision\` function is no longer executable by that login.
3. The database refuses a forged signature, leaving the approval table unchanged.
4. The database refuses to approve when an editor's staff ID is impersonated as a reviewer.
5. A genuine signed Payload reviewer JWT produces an immutable audit row with the exact authenticated staff ID and checksum of the immutable reviewed revision; the test independently recomputes and verifies the HMAC.
6. The human audit row cannot be rewritten even by the test database owner because an immutable trigger rejects UPDATE and DELETE.
7. Replaying the same valid authenticated approval is rejected and cannot change the recorded reviewer identity.

The earlier tests were rerun to prove that reviewer approval, publisher release, approved SSR page rendering, private draft isolation and search sitemap constraints still hold.

## Attestation boundary

An actual Payload JWT is validated inside the Next.js API. The server does **not** accept reviewer identity, checksum, or signature fields from the request body. The server uses the authenticated staff ID, immutable revision's stored SHA-256 checksum, a random 128-bit nonce and a server-side signing secret to compute HMAC-SHA256 over this exact message:

\`revisionId|staffId|revisionChecksum|nonce\`

The restricted reviewer DB principal can only execute \`kg.approve_revision_attested\`; PostgreSQL independently validates the staff record is currently an enabled reviewer *role* (this experiment checks current role value, not account disabled state), recalculates the HMAC, and inserts both the approval and human audit metadata in one transaction.

The HMAC key is created afresh in the isolated CI run and injected into the server environment and a private schema-owner table. It is **never** committed to GitHub. The restricted reviewer role cannot SELECT the key or bypass the attestation function by invoking the old unsigned approval function. PostgreSQL's published revision and outbox remain separated from the private Payload draft.

## Limits and deployment blockers

- This is a **test-only shared application signing key**, not individual private-key signing or an independently authorized human approval service. Compromise of the trusted Next.js server process/signing secret, a high-privilege database account, or the Payload user session can still permit impersonation. Runtime key storage, rotation, KMS/HSM integration, audit export, role revocation, and key-loss recovery require production design.
- A signature tied to the **immutable record checksum** proves the approval was for that snapshot, but **does not prove that claims are factually true** or that the named person personally inspected evidence.
- The SQL function uses PostgreSQL \`SECURITY DEFINER\` owned by the disposable CI schema owner; production must separate that owner from application principals and audit the function's search_path and runtime privileges.
- No constant-time comparison of HMAC strings was proven. The test only confirms correct versus forged signatures are accepted/rejected; timing side-channel review remains pending.
- Actual browser cookie/CSRF/proxy trust, full Next.js deployment behavior, scheduled publication, media rights and external cloud resource or database recovery are still not complete.
- Payload's development-only schema \`push: true\` must be replaced with reviewed migrations before service deployment.

## Decision

**G1 signed individual reviewer-attribution proof: PASS as an isolated experiment.**  
**DECHIVE.WIKI production readiness: NO-GO.**  
No paid AWS resource, DNS change, production data, real identity provider, or \`main\` merge was performed.
