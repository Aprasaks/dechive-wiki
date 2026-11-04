# DECHIVE.WIKI — isolated AWS homepage preview

**State: deployment configuration prepared; not deployed.** This is a temporary static **design review**, NOT production, staging DB or live publication.

## Scope

- Six CloudFormation resources only: private AES-256 S3 bucket, CloudFront Origin Access Control, viewer-request Basic-auth CloudFront Function, response headers policy, CloudFront distribution, restricted S3 bucket policy.
- AWS Seoul region for S3 and CloudFormation; CloudFront is global. Generated CloudFront HTTPS hostname, **no Route 53 or dechive.wiki DNS changes**.
- **Nine static files only**: offline homepage HTML and small JS, seven WebP images. There are no CMS sessions, private drafts, real verified articles, databases, login, external API requests or public app registration.
- Basic auth is TEMPORARY for low-sensitivity UI review. CloudFront Function code contains a Base64 of the credentials, **recoverable by any AWS principal with CloudFront function read access**. Never reuse a real password or store real data. Generate a long random unique password.
- CloudFront may charge for transfer/requests/function invocations; S3 for storage and operations. Pricing/free-tier entitlement must be checked in the actual AWS account. No zero-cost guarantee.

## Pre-deployment gate (human AWS operator required)

1. Inspect the intended Wiki-only AWS account, current IAM identity and unrelated resources, inventory/cost alerts, and the exact AWS account ID. Never clean up or modify unrelated resources.
2. Validate infra/preview/template.yaml with cfn-lint. Prepare a CloudFormation change set for STACK NAME **dechive-wiki-ui-preview**, Region **ap-northeast-2**. Inspect all six resources and expected billing; do NOT execute the change set before approval.
3. Create a unique temporary Basic password; pass its Base64 encoded string for username:password as NoEcho parameter PreviewAuthHeader without storing it in GitHub or the template. Do not share or log credentials.
4. After approval, execute the reviewed CloudFormation change set from an authorized AWS human session, NOT via the existing G0 probe role. Confirm stack outputs include bucket, distribution and HTTPS domain.
5. Create a separate **upload-only** GitHub OIDC role named dechive-wiki-preview-uploader, with permissions limited to s3:PutObject on the exact preview bucket objects, cloudfront:CreateInvalidation on the exact preview distribution and cloudformation:DescribeStacks on this stack. No S3 deletion, IAM admin, Route53, CloudFormation mutation, other accounts or production resources.
6. OIDC role trust must require audience sts.amazonaws.com, subject repo:Aprasaks/dechive-wiki:environment:wiki-preview, and GitHub Environment wiki-preview must be protected with branch restriction **p0/aws-preview-static-hosting** and ideally required reviewer. Environment-based OIDC subject **does not itself constrain branches**.
7. Only after these gates, set GitHub repo variable WIKI_PREVIEW_AWS_ACCOUNT_ID to the intended 12-digit account, set secret DECHIVE_WIKI_PREVIEW_UPLOAD_ROLE_ARN to this exact upload role ARN, and set variable WIKI_PREVIEW_UPLOAD_ENABLED=true. The repository variable is **unset by default**; deployment remains skipped until deliberately enabled.

The AWS GitHub Action always validates the CloudFormation schema/security rules. Its S3 upload job has **zero CloudFormation create/update/delete capabilities**; it uploads only the last explicitly pinned successful offline homepage artifact when the upload flag, AWS role, expected account and stack outputs match. No public service is created by pushes to this branch.

## Pinned, tested artifact

- Source UI GitHub Actions run: **41775623620**.
- Source SHA: **62d3a011a3fcabc9414980f16e229cfdbbf4fc0a**.
- Artifact name: ui-reference-homepage-2026-11-04-proof.
- Upload only directory: offline-preview.
- The artifact has a limited GitHub retention period. If unavailable or its run/SHA differs, FAIL CLOSED. A new source requires another reviewed successful Chrome test and an explicit code change to update the pin.

## After-upload acceptance

1. Unauthenticated HTTPS request must get **401** Basic challenge; authorized request must load HTML/JS/images with **200**.
2. All images display on 1672/1440/768/390/320px widths, no horizontal overflow; UI search and anchors respond, but do not claim verified results.
3. Confirm no third-party network calls, S3 direct anonymous requests blocked, security response headers noindex/CSP/frame protection, and only the six reviewed resources.
4. Re-check AWS billing. Record screenshot evidence and gain explicit owner visual approval before expanding page scope or merging.

## Teardown caution

The preview S3 bucket has **DeletionPolicy: Retain** to prevent accidental data loss. Removing the CloudFormation stack DOES NOT remove retained S3 objects/billing. An authorized operator must separately inspect and delete that exact isolated bucket after confirming no other data was placed there. CloudFront must be removed using reviewed change/cleanup. Production DNS must remain unchanged.

**Status remains NO-GO for production launch.** Static browser preview is not database-backed staging or permission to publish.

## Domain boundary and future launch

- **Owner-designated canonical public domain:** `https://dechive.wiki` (reported registered/secured on 2026-11-04). Domain registration, public DNS resolution, TLS issuance, and live hosting **have not been independently verified**. Do not claim the wiki is online from the domain name alone.
- **Current private preview:** continue using the generated `https://<distribution>.cloudfront.net` hostname with temporary access challenge. Do not attach the root domain to this static, illustrative review build.
- **Future production:** only after the full launch gate, inventory authoritative nameservers and DNS records; create/validate an ACM TLS certificate in `us-east-1` for CloudFront and its production hostname(s); confirm CloudFront aliases and an intentional apex `A/AAAA ALIAS` (or equivalent supported configuration with the domain's DNS provider); then explicitly approve cutover and verify HTTPS, redirects, search robots and origin security.
- **No DNS change in this PR.** The final wiki must not accidentally serve the non-live, offline review/search demonstration as public production content.
