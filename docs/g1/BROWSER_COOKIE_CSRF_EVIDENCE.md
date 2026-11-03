# G1 — Browser Cookie and Cross-Site Request Protection Proof

**Date:** 2026-11-03  
**Status:** Isolated API + development browser-cookie flow PASS; production remains NO-GO.  
**Evidence:** [49/49 checks and successful optimized Next.js build](https://github.com/Aprasaks/dechive-wiki/actions/runs/41652830885).

## Executed tests and controls

- Uses Payload v3.92.1 and Next.js v16.4.4 in an isolated GitHub-hosted PostgreSQL 17.6 test environment.
- Adds Next.js 16 \`proxy.ts\` for **all** \`/api/:path*\` requests. Explicit foreign \`Origin\` and \`Sec-Fetch-Site: cross-site\` requests are denied. Any unsafe \`POST/PATCH/PUT/DELETE\` request using ambient cookies requires **exact configured origin**. No trust in incoming \`Host\` or \`X-Forwarded-Host\` headers. Native Payload collection access checks and PostgreSQL restricted roles remain authoritative; Proxy is defense in depth.
- Payload's auth cookie has \`HttpOnly\` and \`SameSite=Strict\`; the real browser-session simulation uses the \`Set-Cookie\` header from the actual Payload login endpoint and resends it in real HTTP requests.
- Same-origin cookie authentication can read the logged-in staff identity and create a private draft. Cross-site cookie POST to the editor/reviewer/publisher APIs is blocked. Missing, \`null\`, sibling-host and forged origins, cross-site Fetch Metadata and spoofed forwarded host attacks are rejected.
- Next.js development server completed **38/38 HTTP/security checks**. The optimized production build passed TypeScript; the compiled \`next start\` server completed **11/11** separate tests.
- The two exact local origins in this experiment are \`http://127.0.0.1:3100\` for development and \`http://127.0.0.1:3101\` for compiled smoke tests. Production smoke tests are run over loopback HTTP, not over public HTTPS.

## Limits and deployment blockers

1. **Not a real browser driving UI interactions.** Requests emulate browser cookie and Fetch Metadata headers through Node.js Fetch over real TCP; Chrome/Firefox/WebKit navigation, form semantics, cookie jar, cross-site redirects, iframe and session fixation remain to be tested in real browsers.
2. **Not a public HTTPS deployment.** Compiled test configuration requests \`Secure\` cookies but the runner has no TLS certificate or cross-site real browser. A public deployment must set a fixed HTTPS origin and \`Secure\` cookies, with trustworthy reverse-proxy forwarding behavior, HTTPS redirects and HSTS reviewed.
3. \`proxy.ts\` guards unsafe browser-cookie API requests. It is **not** an independent CSRF token implementation, and changing or bypassing the matcher must be treated as a regression. Native Payload \`csrf\` origin whitelist remains configured as defense in depth. All sensitive API endpoints still enforce authenticated roles.
4. Reviewer attestation uses an ephemeral shared server-side HMAC secret and synthetic staff IDs. Production requires approved key custody/rotation, per-person identity assurance and revocation.
5. No privacy, rights, media/CDN takedown, scheduled publication, separate-cluster restore or real source truth was tested.
6. No AWS workloads were purchased or provisioned, no DNS changes and no merge to \`main\`.

**Decision:** G1 cookie/CSRF HTTP experiment PASS. Full production authorization and browser rollout NO-GO.
