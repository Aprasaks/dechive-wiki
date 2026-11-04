# Clean hero background — 2026-11-04

Replaced the screenshot-derived hero with a newly generated, text-free panoramic landscape. No embedded title, search field, chips, logo or UI. Asset: `experiments/payload-g1/public/reference/hero-landscape-v2.webp`.

CSS removes masking workarounds, uses the clean image across widths, and allows hero content height and topic rows to grow. Responsive title sizing prevents a long word from forcing narrow layouts. Export and bundle validation reference the new image; the offline bundle still has nine active files. Existing S3 legacy image is retained but not referenced, for rollback.

Prompt: quiet 3:1 panoramic editorial landscape, winding river, distant hilltop city at far left, mountain ridges and pale moon at right, tree branches upper left, pale central sky, muted sage/ivory/slate; absolutely no text, UI, logos or watermark. Generated using the built-in image tool and encoded as WebP.

Scope: hero background, hero text sizing and suggestion wrapping only. Header and article card contents preserved.
