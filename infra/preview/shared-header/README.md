# Shared header for the protected static preview

`header.html` and `header.css` are the single editable source for the homepage
and review pages. Run `python3 apply.py index.html review/pompeii.en.html
review/domain-history.html` on local deployment copies before uploading.
The script validates all inputs first, preserves robots metadata, and is
idempotent. It does not deploy, publish, change authentication or read drafts.

These files are for the existing password-protected design preview, not the
final Next.js production component. An automated preview deployment must run
this step; the older pinned-artifact workflow currently does not. Do not
assume changing this folder alone updates an already-deployed website.
