-- DECHIVE.WIKI G1 HTTP boundary proof, disposable CI database ONLY.
-- Must be applied by the isolated test schema owner after KG migrations.
-- psql -v reader_password=<random ephemeral value> -f experiments/payload-g1/sql/001_http_reader.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE kg_public_http LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
  PASSWORD :'reader_password';

-- A search document is public only while it matches the exact active approved
-- snapshot. No independent searchable or unpublished records can appear.
CREATE VIEW kg.public_search_verified WITH (security_barrier=true) AS
SELECT p.entity_id, p.locale, p.version, p.revision_id, p.body
FROM kg.search_projection p
JOIN kg.heads h ON h.entity_id=p.entity_id AND h.locale=p.locale
JOIN kg.snapshots s ON s.id=h.snapshot_id
JOIN kg.revisions r ON r.id=s.revision_id
WHERE p.version=h.version
  AND p.revision_id=s.revision_id
  AND p.body=r.body
  AND s.checksum=r.checksum
  AND h.snapshot_id IS NOT NULL;

REVOKE ALL ON SCHEMA kg FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA kg FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA kg FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA kg FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA kg REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

GRANT USAGE ON SCHEMA kg TO kg_public_http;
GRANT SELECT ON kg.public_entries TO kg_public_http;
GRANT SELECT ON kg.public_search_verified TO kg_public_http;
COMMIT;
