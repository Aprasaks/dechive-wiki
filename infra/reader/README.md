# Private AWS reader pilot

Deployment preparation only. No paid resource, IAM role, DB or public app endpoint has been created by this change.

## Why a separate artifact

The G1 app includes disposable Payload schema-push configuration and privileged editorial APIs. Do not deploy that application tree. `stage.py` creates an explicit public-source allowlist with an ordinary Next standalone config, no Payload plugin, no Studio/API routes, no schema-push config and no publishing credentials. The canonical DB schema is still the verified PostgreSQL knowledge model. This is not a database architecture change.

CI builds the staged source and executes its standalone `server.js` using **only PUBLIC_DATABASE_URL** for the restricted `kg_public_http` role. It tests actual search/detail/source HTTP and 404s for editorial/API routes. The resulting container runs as the unprivileged Node user. Supply the DB URL at runtime; never put it in a build argument or artifact.

The package lock still includes test-project dependencies for reproducibility; only traced standalone dependencies ship. No sitemap is copied because the current test sitemap hardcodes the production hostname.

## Concrete proposed AWS change

`pilot.json` creates four resources in Seoul: one t3.small, an encrypted 30 GiB gp3 root volume managed by that instance, a security group, an instance profile and its role (the volume is implicit). Supply a public subnet in the chosen VPC. No incoming ports are permitted, including SSH, HTTP and PostgreSQL. One transient public IPv4 provides outbound access without a NAT gateway. Management uses SSM. The only instance policy is AWS's AmazonSSMManagedInstanceCore; no S3, Secrets Manager, publishing or deployment permission is added. Do not create it until the owner approves this new management role and paid pilot.

The host's timer requests a stop after 24 hours of boot time. CPU credit mode is **standard**, avoiding Unlimited CPU charges. A stop releases its automatically assigned IPv4 but retains the disk. This is a mitigation, not a hard billing cap: failed timers, restarts and retained storage can incur cost. Restart only under a new test window. Do not terminate the instance with real content on it; the root volume has DeleteOnTermination enabled. This pilot is for synthetic data only.

This template provisions the host only. After approval: verify the VPC/subnet/route and non-root deployment principal; create a reviewed change set; provision the host; install the verified reader artifact and an isolated PostgreSQL container; apply db/001–004, reader SQL 001 and source-view SQL 006 using a one-time schema owner; generate separate DB passwords on the host; give the web process only the reader URL; bind DB privately and HTTP to loopback; test via SSM. No native CMS schema push, fixture editor accounts or shared CI passwords. Seed only explicitly labelled synthetic test articles. Record artifact digest, HTTP evidence, timer and stop status. Production domain, existing CloudFront and real editorial data stay outside this pilot.

Before any real content or public launch, add reviewed editorial migrations/runtime, authenticated staff provisioning, backup/restore and publishing-worker operations. Those are not claimed complete by this package.

## Cost evidence, 2026-11-04

AWS Price List API queried from the owner's console returned Seoul Linux shared t3.small at **USD 0.026/hour**. Compute alone is USD 0.624 for 24 hours or USD 18.98 for 730 hours. Public IPv4 costs USD 0.005/hour (USD 0.12/day). EBS, tax and transfer are additional; no free-tier credit is assumed. Approve a **USD 2 total incremental test allowance for one 24-hour pilot**, not continuous operation. This is an operating allowance, not a technical hard cap. Existing account budgets are USD 5 alerts only.

Sources:
- https://aws.amazon.com/ec2/pricing/on-demand/
- https://aws.amazon.com/vpc/pricing/
- https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html
- https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-instance-profile.html

## Validation and review

CI verifies staged compilation and actual standalone HTTP, not AWS provisioning or live operation. `aws cloudformation validate-template --template-body file://infra/reader/pilot.json` validates the service's template syntax without creating resources. Review the final change set separately before execution. Do not use root as the deployment principal. The existing no-privilege OIDC probe role is not a deployment role and must not be widened implicitly.
