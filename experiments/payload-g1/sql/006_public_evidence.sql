-- Isolated test migration. Sources and approved claim/evidence rows are immutable
-- under 002_review_integrity_p0.sql; expose only the exact current public revision.
\set ON_ERROR_STOP on
BEGIN;
CREATE VIEW kg.public_claim_sources WITH (security_barrier=true) AS
SELECT p.entity_id,p.locale,p.version,p.revision_id,
 c.claim_key,c.anchor,c.statement,s.id AS source_id,
 s.locator,s.description,s.accessed_at,ev.stance,ev.pinpoint,ev.checked_at
FROM kg.public_entries p
JOIN kg.claims c ON c.revision_id=p.revision_id
JOIN kg.claim_evidence ev ON ev.revision_id=c.revision_id AND ev.claim_key=c.claim_key
JOIN kg.sources s ON s.id=ev.source_id
WHERE p.locale='en';
REVOKE ALL ON kg.public_claim_sources FROM PUBLIC;
GRANT SELECT ON kg.public_claim_sources TO kg_public_http;
COMMIT;
