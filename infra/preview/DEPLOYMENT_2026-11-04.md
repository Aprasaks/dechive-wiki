# AWS design preview deployment — 2026-11-04

Owner approved execution of the reviewed six-resource change set in the connected AWS console. This remains a static design review, not a production wiki launch.

## Deployed boundary

- Stack: `dechive-wiki-ui-preview`, `ap-northeast-2`.
- Change set: `preview-review-585df7f`, based on template commit `585df7f04499d8e9185226c7cfba3c16fb07b265`.
- CloudFront distribution: `E3AAGVTN6KV390`; reported `Deployed`.
- Preview: https://d1eu1n2j5v1khk.cloudfront.net/ (temporary Basic authentication required).
- Dedicated private S3 bucket; upload performed directly from the owner-authorized AWS console session. No new GitHub uploader role, OIDC trust, or deployment flag was needed or enabled.
- No production domain/DNS changes or database resources.

## Artifact and acceptance

- Source run `41775623620`, SHA `62d3a011a3fcabc9414980f16e229cfdbbf4fc0a`, artifact ID `13296419252`.
- Downloaded ZIP SHA-256 matched `075b872912625f7ca804267ba6ec894a0d59292ff1222ae7585f776c676813f9`.
- Extracted only `offline-preview/`; pinned `validate_bundle.py` passed for exactly nine offline files.
- Uploaded only those nine files, with `Cache-Control: no-store`.
- HTTPS unauthenticated: 401.
- Authenticated: all nine objects returned 200; response body hashes matched original local files.
- Anonymous direct S3 index request: 403.
- Confirmed noindex/nofollow/noarchive, frame DENY, and restrictive CSP including `connect-src 'none'`.
- Previously pinned Chrome visual proof is valid for the uploaded bytes; new authenticated live browser visual approval remains pending.

## Cost and next steps

Before creation, console current-month cost displayed USD 0.01. Two existing account budgets each have USD 5 limits; budgets are not hard spending caps. No zero-cost guarantee or post-deployment billing result is claimed.

Temporary credentials are not recorded in this repository. CloudFront Function readers can recover the Basic credential; use only non-sensitive design files. Retained S3 bucket requires separately authorized cleanup if the preview is retired.

Next: owner opens the protected preview and reviews desktop/mobile rendering, then continue production application work independently of this static preview. Production domain attachment remains a future launch gate.
