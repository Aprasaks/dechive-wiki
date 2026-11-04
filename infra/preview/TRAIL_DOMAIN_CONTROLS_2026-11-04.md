# Knowledge trail and domain controls — 2026-11-04

Owner scope: leave journey cards for real-content work; correct the knowledge trail banner and replace the visible domain scrollbar with arrow controls.

Source commit `e277ee552c1cf3e1713928bc08c69202d8b6e740` adds a newly generated text-free dark-green Earth/network image, responsive banner text/CTA flow, and an accessible DomainScroller client component. Image WebP SHA-256: `953842847b763f6c164351da0f519445f84716e57434376fe675e38a1ede1ab7`. Generation brief: refined forest-green/gold Earth horizon and connections on the right, dark quiet left side, no labels, writing, UI, logos or buttons.

Offline export includes equivalent arrow behavior; active bundle validation now expects the new trail filename. Live deployment updated only index.html, preview.js and reference/trail-network-v2.webp. Existing JS was verified as an unchanged prefix before appending the domain controls. All 12 domain entries preserved. Legacy unreferenced images retained for rollback.

## Verified in live authenticated Chrome

- Widths 320, 390, 540, 768, 1024, 1280, 1440, 1920: domain controls contained, all 12 entries retained, banner title fits, description precedes CTA without overlap.
- At narrow widths: visible previous/next buttons; native scrollbar hidden; touch/keyboard scrolling remains available.
- At 390px: next click moved scrollLeft to 156; repeated next clicks reached 733/733, showed the final category and disabled next; previous button moved back.
- At 1280/1440/1920px: all entries fit, arrow buttons automatically hidden.
- No captured browser console errors. Screenshot captured at 390px. Temporary viewport override reset.

Journey cards and their images remain unchanged as explicitly requested. Domain destinations remain unavailable in the design preview; arrow controls navigate the category strip, not unpublished content.
