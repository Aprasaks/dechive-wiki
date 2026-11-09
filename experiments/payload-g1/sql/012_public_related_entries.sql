-- Isolated reader migration. Expose only evidence-backed, approved relations
-- between two currently published English entries. No draft, entity-name or
-- reviewer metadata is included in this public projection.
\set ON_ERROR_STOP on
BEGIN;

-- A general related-to link may connect two places (for example a city and
-- a volcano); it still requires separate human-approved relation evidence.
INSERT INTO kg.relation_rules(kind,subject_type,object_type)
VALUES ('related_to','place','place')
ON CONFLICT DO NOTHING;

CREATE VIEW kg.public_related_entries WITH (security_barrier=true) AS
SELECT r.id AS relation_id,
       src.entity_id,
       dst.entity_id AS related_entity_id,
       dst.version AS related_version,
       meta.title,meta.summary,meta.primary_domain
FROM kg.relations r
JOIN kg.public_entries src
  ON src.locale='en' AND src.entity_id IN (r.subject,r.object)
JOIN kg.public_entries dst
  ON dst.locale='en'
 AND dst.entity_id=CASE WHEN src.entity_id=r.subject THEN r.object ELSE r.subject END
JOIN kg.public_revision_metadata meta
  ON meta.entity_id=dst.entity_id AND meta.locale=dst.locale
 AND meta.version=dst.version AND meta.revision_id=dst.revision_id
WHERE r.kind='related_to' AND r.status='approved'
  AND EXISTS (SELECT 1 FROM kg.relation_evidence evidence
              WHERE evidence.relation_id=r.id AND evidence.stance='supports');

REVOKE ALL ON kg.public_related_entries FROM PUBLIC;
GRANT SELECT ON kg.public_related_entries TO kg_public_http;
COMMIT;
