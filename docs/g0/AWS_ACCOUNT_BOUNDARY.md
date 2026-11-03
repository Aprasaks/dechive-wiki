# G0 — AWS Account Boundary and Cost Guard (Evidence)

**Date:** 2026-11-03
**Status:** PARTIAL PASS — account inspected; secure human/deployment identities and spend enforcement remain open.
**Scope:** DECHIVE.WIKI only. This public document intentionally omits account number, credentials, email, secret ARNs and internal URLs.

## Directly observed
- AWS account is standalone, not a member of AWS Organizations.
- Root MFA is enabled; root access keys are absent.
- IAM users: zero. Identity Center instances: zero in Seoul and N. Virginia.
- Existing account-wide USD 5/month Cost Budget with actual-spend alerts at 50%, 80%, 100%. On 2026-11-03 a second monitoring-only budget named DECHIVE-WIKI-P0-COST-GUARD was actually created at the same USD 5/month threshold with 50%, 80%, and 100% notifications and matching subscriber configurations. Two budgets exist until the new alert delivery is proven; neither enforces a spending ceiling.
- In Seoul: 0 EC2 reservations, 0 RDS DB instances, 0 DynamoDB tables, 0 Lightsail instances, 0 Lambda functions.
- Globally: 0 S3 buckets, no CloudFront distributions in the current listing.
- These reads do not prove absolute zero spend or absence of every AWS service; AWS charges can post later.

## Binding project decisions

| Area | Rule |
| --- | --- |
| Scope | Account dedicated to DECHIVE.WIKI only |
| Primary region | ap-northeast-2 (Seoul), pending workload-cost check |
| Naming | dechive-wiki-ENV-SERVICE |
| Tags | Project=DECHIVE-WIKI; Environment=p0/staging/production; Owner=DECHIVE-WIKI; ManagedBy=IaC; CostCenter=wiki |
| Credentials | No static AWS keys in GitHub or app; root never used as a deployment principal |
| Deployment | No billable production resources until a least-privilege role, cost boundary and recovery design are verified |
| Audit trail | All infrastructure changes go through reviewed versioned manifests |
| Data isolation | No unrelated project data migration or reused application secrets |

## Identity Center pitfall

Do not create an IAM Identity Center **account instance** expecting it to supply AWS account administrator permission sets: that instance type does not support account permission sets. An Organization instance would require explicit AWS Organizations/account planning and could change billing/free-tier status. For now, use a documented non-root MFA-protected human access model and tightly scoped GitHub OIDC roles when ready.

Official sources:
- https://docs.aws.amazon.com/singlesignon/latest/userguide/account-instances-identity-center.html
- https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html

## Remaining G0 gates

- [x] Standalone account and current baseline resource inventory inspected
- [x] Root MFA and absence of root access keys checked
- [x] Dedicated DECHIVE-WIKI-P0-COST-GUARD USD 5 budget created; alert rules 50%/80%/100% verified
- [x] Configured notification subscribers exist (one per rule); actual email delivery is untested
- [ ] Verify the first budget alert was actually received before deleting the legacy cost guard
- [ ] Set up and test an MFA-protected non-root human administrator
- [ ] Create an environment-restricted GitHub OIDC deployment role with least-privilege access
- [ ] Prove external PRs cannot assume deployment roles
- [ ] Agree numeric monthly compute budget and application-level hard consumption guards
- [ ] Test CloudTrail visibility, incident response, backups and restore
- [ ] Re-run full enabled-region inventory before first paid resource
- [ ] Separate approval for paid AWS compute required by an actual Wikibase Suite benchmark

**Gate decision:** PARTIAL PASS / paid infrastructure NO-GO. Existing AWS budget is an alert, not a hard spending limit.
