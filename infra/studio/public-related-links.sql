BEGIN;
CREATE TABLE IF NOT EXISTS kg.studio_public_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subject uuid NOT NULL,
 object uuid NOT NULL,
 CHECK(subject<>object),
 UNIQUE(subject,object)
);
REVOKE ALL ON kg.studio_public_links FROM PUBLIC;
CREATE OR REPLACE VIEW kg.public_related_entries WITH (security_barrier=true) AS
SELECT r.id AS relation_id,src.entity_id,dst.entity_id AS related_entity_id,
       dst.version AS related_version,meta.title,meta.summary,meta.primary_domain
FROM kg.relations r
JOIN kg.public_entries src ON src.locale='en' AND src.entity_id IN (r.subject,r.object)
JOIN kg.public_entries dst ON dst.locale='en' AND dst.entity_id=CASE WHEN src.entity_id=r.subject THEN r.object ELSE r.subject END
JOIN kg.public_revision_metadata meta ON meta.entity_id=dst.entity_id AND meta.locale=dst.locale
 AND meta.version=dst.version AND meta.revision_id=dst.revision_id
WHERE r.kind='related_to' AND r.status='approved'
 AND EXISTS (SELECT 1 FROM kg.relation_evidence evidence WHERE evidence.relation_id=r.id AND evidence.stance='supports')
UNION ALL
SELECT link.id,src.entity_id,dst.entity_id,dst.version,meta.title,meta.summary,meta.primary_domain
FROM kg.studio_public_links link
JOIN kg.public_entries src ON src.locale='en' AND src.entity_id IN (link.subject,link.object)
JOIN kg.public_entries dst ON dst.locale='en' AND dst.entity_id=CASE WHEN src.entity_id=link.subject THEN link.object ELSE link.subject END
JOIN kg.public_revision_metadata meta ON meta.entity_id=dst.entity_id AND meta.locale=dst.locale
 AND meta.version=dst.version AND meta.revision_id=dst.revision_id;
REVOKE ALL ON kg.public_related_entries FROM PUBLIC;
GRANT SELECT ON kg.public_related_entries TO kg_public_http;
INSERT INTO kg.studio_public_links(subject,object)
VALUES ('31ecf978-4412-4de1-a056-2b83c2533372','d51869b1-3dba-437c-b7c8-10441ebb710a')
ON CONFLICT (subject,object) DO NOTHING;
COMMIT;
