# Compact hero search — 2026-11-05

User requested a smaller search bar after reviewing a 500px hero screenshot. The current authenticated preview measured 720px search width at a 756px viewport and 53px height; repository source caps the search area at 850px.

Change only search styling:
- Form maximum width 640px, centered independently of the 850px topics/suggestion area.
- Form height 48px, button height 38px, smaller desktop input/icon/shortcut sizing.
- Mobile form height 48px (previously 56px); 16px input text retained for mobile readability.
- Hero height, image, title, navigation and downstream sections are unchanged. The submitted screenshot's 500px height is not claimed to be the currently deployed value.

No search behaviour or data source changes. No additional tests written for this reversible CSS change.

Validation: source diff and breakpoint cascade inspected; no full browser render of the changed source has been performed. Local CSS parser package unavailable. Existing preview remains unchanged.

Deployment blocked: automatic browser approval review denied AWS console origin access in this turn, because the current UI-edit request was not treated as permission to access the sensitive AWS console session. No workaround attempted. Owner approval to access AWS for the narrow static-preview update is required before upload/CloudFront invalidation. Preserve Basic authentication and all other resources.
