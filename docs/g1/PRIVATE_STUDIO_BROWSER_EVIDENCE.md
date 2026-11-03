# G1 — Private Editorial Studio and Actual Chrome Browser Gate

**Date:** 2026-11-03  
**Environment:** disposable PostgreSQL 17.6, real Next.js 16.4.4 + Payload 3.92.1, separate reviewer/publisher database credentials.  
**Production status:** NO-GO; never publish the test-lab homepage or expose synthetic staff accounts on the internet.

## Implemented

- English-only, verification-first staff login at \`/studio/login\`; no public signup.
- Protected \`/studio\` server-rendered workspace. The server authenticates the real HTTP-only Payload staff cookie using \`payload.auth\`; anonymous or invalid credentials redirect to the sign-in page.
- Role-specific interface: **Editor** can create a private draft using the genuine access-controlled Payload REST API; **Reviewer** can inspect private drafts but cannot edit them; **Publisher** cannot read or create drafts through this interface and is limited to publication responsibility.
- The UI does not offer a shortcut to publishing. A private draft does not enter the canonical KG public head, search or sitemap until an independent evidence review and approved revision.
- Studio page/route headers instruct browsers and intermediaries not to index, frame or cache private UI. Login and data mutations remain protected by the existing strict cookie, CSRF-origin and Payload role checks.
- Buttons that can mutate state are disabled until browser-side React hydration, preventing a premature form click from generating a native unhandled GET/POST.

## Automated server verification

The Next.js real development server has passed **44/44** assertions after adding workspace role access and anonymous redirects. A strict typed optimized Next.js production build and a separate compiled \`next start\` server have passed **13/13** privacy and permission tests (total **57/57**). Real Chrome E2E added 9 additional assertions: **66/66 across all three test groups**. Earlier separate native HTTP and signed-review proof remains stacked in PRs #12–#15.

## Real Chrome browser E2E (9/9 verified)

The branch includes a pinned Playwright Core driver that launches the **actual Google Chrome** binary supplied by a GitHub-hosted Ubuntu runner. It exercises:

1. Anonymous navigation to \`/studio\` is redirected to login.
2. Editor login stores the actual HttpOnly SameSite=Strict cookie.
3. Editor clicks the private draft form and sees a saved private draft appear in its own list.
4. The newly created draft is absent from public knowledge URL and sitemap.
5. A malicious same-site/cross-origin HTML form is stopped by the CSRF Proxy.
6. Real browser logout revokes studio access.
7. A second editor cannot read the first editor's draft; reviewer can read without edit controls; publisher cannot edit or view private drafts.
8. Synthetic screenshots are uploaded as short-retention GitHub Actions artifacts only after successful captures.

**Verified real Chrome E2E:** [GitHub Actions run #41655991830](https://github.com/Aprasaks/dechive-wiki/actions/runs/41655991830) completed successfully with **9/9 actual Google Chrome browser assertions**, in addition to **44/44 Next.js dev HTTP checks** and **13/13 compiled Next.js production checks**. The test recorded Chrome version 156.0.8078.79. An archived, synthetic-only `g1-studio-browser-proof` artifact contains editor and reviewer screenshots (7-day retention).

The initial Chrome run found a real hydration timing issue when the browser clicked sign-in too early. Both login and private draft forms were changed to disable their submit actions until client-side React hydration, and the subsequent Chrome run passed. This is independently recorded in the CI logs.

## Remaining G1 and launch blockers

- A minimal editorial workspace is not a reviewed design or full administrative CMS; reviewer claim/rights verification and release UX remain unfinished.
- Real browser test uses CI Chrome over HTTP loopback, not HTTPS with secure cookies, TLS trust, live reverse proxies or multiple production origins.
- Authenticated reviewer attestation is protected by a shared, test-only HMAC key. Production key custody, rotation, MFA-backed human identity and audit export are not complete.
- Production migrations and independent-cluster backup/restore, version restore/scheduled job bypass, rights/media/takedown and live evidence verification must be audited.
- All runs use synthetic test data, no billable AWS workload or secrets, no domain change, and no merge to \`main\`.

**Decision:** Continue isolated G1 proof and browser E2E. Do not deploy or merge release code.
