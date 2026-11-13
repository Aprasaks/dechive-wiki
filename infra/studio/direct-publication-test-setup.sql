CREATE EXTENSION pgcrypto;
CREATE SCHEMA kg;
CREATE TABLE kg.entities(id uuid primary key);
CREATE TABLE kg.revisions(id uuid primary key,entity_id uuid,locale text,body text,checksum text);
CREATE TABLE kg.snapshots(id uuid primary key,revision_id uuid,checksum text);
CREATE TABLE kg.heads(entity_id uuid,locale text,version bigint,snapshot_id uuid);
CREATE TABLE kg.search_projection(entity_id uuid,locale text,version bigint,revision_id uuid,body text);
CREATE TABLE kg.revision_reader_metadata(revision_id uuid,title text,summary text,primary_domain text);
CREATE VIEW kg.public_entries AS
 SELECT h.entity_id,h.locale,h.version,r.id revision_id,r.body,r.checksum
 FROM kg.heads h JOIN kg.snapshots s ON h.snapshot_id=s.id
 JOIN kg.revisions r ON r.id=s.revision_id WHERE s.checksum=r.checksum;
CREATE VIEW kg.public_search_verified WITH (security_barrier=true) AS
 SELECT p.entity_id,p.locale,p.version,p.revision_id,p.body
 FROM kg.search_projection p JOIN kg.heads h ON h.entity_id=p.entity_id AND h.locale=p.locale
 JOIN kg.snapshots s ON s.id=h.snapshot_id JOIN kg.revisions r ON r.id=s.revision_id
 WHERE p.version=h.version AND p.revision_id=s.revision_id AND p.body=r.body
 AND s.checksum=r.checksum AND h.snapshot_id IS NOT NULL;
CREATE VIEW kg.public_revision_metadata WITH (security_barrier=true) AS
 SELECT p.entity_id,p.locale,p.version,p.revision_id,m.title,m.summary,m.primary_domain
 FROM kg.public_entries p JOIN kg.revision_reader_metadata m ON m.revision_id=p.revision_id WHERE p.locale='en';
