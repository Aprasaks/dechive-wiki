# DECHIVE.WIKI — release handoff, 2026-11-08

## Why this exists

Repeated isolated proof-of-concept changes are not the same as a working release.
The near-term objective is to connect the owner-reviewed English Pompeii and
Mount Vesuvius articles, their rights-reviewed images, and their relationship
to the existing AWS-hosted preview without publishing unapproved material.

## Evidence and limits

- The owner reviewed the current protected preview and its images in prior
  conversation. The exact current AWS objects and headers must be rechecked.
- The integration branch contains a Payload/Next/PostgreSQL experiment and
  synthetic-only CI checks. These are not a deployed AWS application, real
  editorial verification, member login, or a production publication workflow.
- Multi-source evidence can be staged in the isolated test; the existing
  multi-source approval block remains. Image publication and current public
  reading have not been validated for the real two manuscripts.
- README and infra/preview/README.md describe earlier checkpoints and contain
  conflicting historic deployment status. Do not use either alone as current
  inventory. Preserve existing content and verify the live environment first.
- Do not copy unpublished manuscripts, secrets, private credentials or raw
  editorial review records into a potentially public repository.

## Concrete next milestones

1. **Reconcile current preview** — use read-only AWS inspection to identify
   the distribution, origin, access protection, robots/indexing headers, exact
   object keys and versions for both articles, shared header and image assets.
   Compare against the current repository without exposing article text.
2. **Prove actual article round trip privately** — preserve the authoritative
   AWS originals; import each manuscript and all references, images, credits
   and relationship data into a private isolated environment. Compare visible
   content, links and image references against originals. Report differences;
   never infer factual verification from a technical check.
3. **Make one complete publication path** — implement review, approval, image
   rights checks, article display, cross-links and search against the same
   tested version. Preserve a previously approved version during edits.
   Do not remove the existing multi-source approval block before equivalent
   authorization, completeness and rights enforcement is tested.
4. **Prepare launch** — select and verify the actual AWS runtime and storage,
   review costs, IAM, secrets, backups/restore, member login/bookmarks, share
   previews, canonical URLs, sitemap and noindex-to-index transition.
   Confirm what is available on day one and remove misleading dead controls.
   Public access and launch are separate from a protected preview.

## Working rule

Do not start another isolated experiment unless it removes a named blocker
above. Report a completed end-to-end milestone and remaining gaps, rather than
asking the owner to repeatedly run or monitor individual tests.
