# Private reader AWS pilot — 2026-11-04 UTC

## Result

The owner signed in as the existing MFA operator. A one-hour deployment-role session was obtained and verified before any host provisioning. Root was not used for the host or runtime installation.

The reviewed IAM-free host change set created a Seoul t3.small and security group successfully (CREATE_COMPLETE). Live EC2 reads confirmed IMDSv2 required, encrypted 30 GiB gp3 volume, no inbound security-group rules and only TCP 443 egress. CPU credit mode in the deployed template is standard.

The SSM agent and the 24-hour stop timer were active. Real AWS-StartInteractiveCommand sessions succeeded using the minimal node policy and the scoped deployment role.

## Installed private runtime

- Exact GitHub runtime artifact: 13312375217 from run 41809340538, source 6c03c0f0adac990f150fee0371e86ac875652f26.
- ZIP SHA256: 7fa2a24ff633ff025ceeaf6f8a11b68a2ede9b2d45c32afc025f49a49f364792. Both the ZIP and its inner standalone archive checksum were verified on the node.
- Node image: node@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da.
- PostgreSQL image: postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94 (17.6).
- Docker from Amazon Linux packages; application runs as node, read-only filesystem, dropped capabilities, no-new-privileges and a bounded tmpfs/memory/CPU.
- The DB has no published host port. DB and reader share an internal Docker network. Random DB passwords were generated only on the node and kept in root-only runtime files. Only the restricted kg_public_http URL is given to the web container.
- Reviewed migrations db/001–004, HTTP reader 001 and public evidence 006 were applied in dependency order. No fixture, article, source or editorial identity was inserted.
- Docker 25 internal networks did not publish the requested loopback port. A systemd socat relay running as nobody binds only 127.0.0.1:3000 and forwards to the reader's internal address. It preserves Docker network isolation. The backend address must be regenerated if that container is recreated.
- Initialization readiness was corrected to wait for PostgreSQL TCP readiness, avoiding the temporary initialization server.

## Live verification

verify-private-pilot.py passed 23/23 checks on AWS: empty catalog/public views, nonprivileged reader role, no private-table/publishing grants, approved-view access, non-root/read-only runtime, no host DB port, loopback HTTP configuration, internal Docker network, home 200, empty-catalog search 200, noindex/no-store/frame headers, 404 for six editorial/private/detail paths, POST login API 404, PostgreSQL dump restored into a separate disposable database and verified, active stop timer and SSM agent.

The restore database was removed after the test. The root-only backup remains on the encrypted node disk; this is an empty-schema drill, not proof of off-host disaster recovery or restoration of real published content.

## Scope and next work

The public domain still serves the protected static design preview. No CloudFront cutover or public application port was introduced. No article was chosen or published.

Stop the host after this test and verify stopped state. The encrypted disk is retained and remains billable. Before continuous operation or actual editorial content: complete private staff runtime/auth provisioning, authenticated editorial integration, off-host backup/restore, restart/address checks, and public origin design. Do not treat this private pilot as production-ready.
