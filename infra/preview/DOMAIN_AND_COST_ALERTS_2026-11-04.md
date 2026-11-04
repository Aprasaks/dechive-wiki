# Custom HTTPS domain and cost alerts — 2026-11-04

## Verified live

- Owner approved continuation in the signed-in Vercel management UI after the connector could not modify system-managed records.
- Rechecked CloudFront distribution E3AAGVTN6KV390: Deployed; apex and www aliases present. Previously reviewed stack update is UPDATE_COMPLETE; only the existing distribution changed, with no replacement.
- The domain's management UI allowed normal DNS record creation. Created an apex ALIAS and www CNAME to d1eu1n2j5v1khk.cloudfront.net., TTL 60. Existing certificate validation CNAMEs and CAA remain. No permission was expanded.
- HTTPS using normal public DNS returned HTTP 401 and TLS verification result 0 for dechive.wiki and www.dechive.wiki. The Basic-auth protection remains active.
- Authenticated HTTPS returned HTTP 200 on both custom domains and the original CloudFront hostname; SHA-256 of all homepage bodies matched. Preview credentials were loaded only within the authorized AWS environment and were never printed or committed.
- Opening the custom domain in the connected Chrome browser reached the authentication boundary (ERR_INVALID_AUTH_CREDENTIALS). A successful authenticated browser rendering on the new hostname remains for the owner to complete using the existing preview login. No security warning was bypassed.

## Cost notifications

Updated the existing account-wide monthly DECHIVE-WIKI-P0-COST-GUARD budget from USD 5 to USD 25, with actual-cost absolute-value alerts above USD 25, 30 and 40. Updated its three existing notifications in place and retained existing email subscribers (one per rule). Read-back verified thresholds and nonempty subscriber lists. No subscriber address is recorded here.

The separate legacy dechive-preview-account-cost-guard budget still has its USD 5 limit and old notifications. It was retained pending delivery verification. Users may therefore receive earlier legacy alerts as well. No additional budget was created.

Notification configuration is verified; actual email receipt/verification status is not. Budgets are delayed monitoring, not a hard spending cap, and no automatic resource shutdown action was added. A private mode-0600 pre-change backup was saved in the authorized AWS environment for recovery.

## Remaining work

The domain serves the protected static design preview. New public-reader code is tested and packaged separately in PR #24 but is not installed on a paid AWS host. No server/DB or new IAM role was created during this work. Next: prepare a scoped non-root deployment principal, approve any new security-sensitive grants at action time, then connect the actual runtime/database, test recovery and publish a separately reviewed real article.
