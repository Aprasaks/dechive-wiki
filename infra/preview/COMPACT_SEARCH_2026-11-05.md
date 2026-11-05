# Compact search and single-row navigation — 2026-11-05

Deployed to the existing private S3/CloudFront design preview after explicit owner approval of AWS access and deployment.

- Search form: max-width 640px, height 48px; button and icon scaled proportionally.
- Topic suggestions keep their separate area width.
- At widths up to 1360px, navigation uses one nonwrapping, horizontally scrollable row, with a thin scroll indicator and scroll-snap proximity.
- Header brand/tools remain above that navigation row on small screens. Navigation items themselves never wrap.
- Hero height/background/title and downstream content preserved.

Deployment patched only index.html's head with a scoped style block. Original HTML backed up in the owner's CloudShell; request used S3 IfMatch with the original ETag. An assertion verified the entire body remained byte-for-byte unchanged. No auth, IAM, DNS, compute or database changes. Invalidated / and /index.html only.

Deployed HTML SHA256: b3dc876b06cc87fcb6f0e4e18261824999da1ccea809e2fbbac928b427d385af.
CloudFront invalidation: I6ITODBL9PH40B2SSO8264ABLY.

Live browser verification:
- Desktop viewport 1512px: search 640 x 48px; navigation nowrap.
- Mobile viewport 390px: search 364 x 48px; navigation viewport 366px, content 753px.
- All nine menu items had the same top coordinate (one line).
- Native horizontal input moved scrollLeft from 0 to 387px, the end of the menu.
- Document scrollWidth equalled viewport width (390px), without page-wide horizontal overflow.
- Screenshot captured after horizontal scroll; temporary viewport override reset afterwards.

The supplied earlier screenshot described a 500px hero; this change does not impose that height. Current live hero sizing is preserved. The page remains a protected design preview.
