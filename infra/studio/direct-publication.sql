-- Personal studio publication bridge. Apply to the reader database by its owner.
-- The editor service receives only EXECUTE on the publication function.
BEGIN;
CREATE TABLE kg.studio_public_revisions (
  revision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  version bigint NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 100000),
  summary text NOT NULL,
  primary_domain text NOT NULL CHECK(primary_domain IN ('science','technology','humanities','philosophy','history','society','economics','health','life','space','earth','arts-culture')),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, version),
  UNIQUE (entity_id, revision_id, version)
);
CREATE TABLE kg.studio_public_heads (
  entity_id uuid PRIMARY KEY,
  revision_id uuid NOT NULL,
  version bigint NOT NULL,
  FOREIGN KEY (entity_id, revision_id, version)
    REFERENCES kg.studio_public_revisions(entity_id, revision_id, version)
);
CREATE OR REPLACE VIEW kg.public_entries AS
 SELECT h.entity_id,h.locale,h.version,r.id revision_id,r.body,r.checksum
 FROM kg.heads h JOIN kg.snapshots s ON h.snapshot_id=s.id
 JOIN kg.revisions r ON r.id=s.revision_id WHERE s.checksum=r.checksum
 UNION ALL
 SELECT r.entity_id,'en'::text,r.version,r.revision_id,r.body,
        encode(public.digest(r.body,'sha256'),'hex') AS checksum
 FROM kg.studio_public_heads h JOIN kg.studio_public_revisions r
 ON (h.entity_id,h.revision_id,h.version)=(r.entity_id,r.revision_id,r.version);
CREATE OR REPLACE VIEW kg.public_search_verified WITH (security_barrier=true) AS
 SELECT p.entity_id,p.locale,p.version,p.revision_id,p.body
 FROM kg.search_projection p
 JOIN kg.heads h ON h.entity_id=p.entity_id AND h.locale=p.locale
 JOIN kg.snapshots s ON s.id=h.snapshot_id JOIN kg.revisions r ON r.id=s.revision_id
 WHERE p.version=h.version AND p.revision_id=s.revision_id AND p.body=r.body
 AND s.checksum=r.checksum AND h.snapshot_id IS NOT NULL
 UNION ALL
 SELECT r.entity_id,'en'::text,r.version,r.revision_id,r.body
 FROM kg.studio_public_heads h JOIN kg.studio_public_revisions r
 ON (h.entity_id,h.revision_id,h.version)=(r.entity_id,r.revision_id,r.version);
CREATE OR REPLACE VIEW kg.public_revision_metadata WITH (security_barrier=true) AS
 SELECT p.entity_id,p.locale,p.version,p.revision_id,m.title,m.summary,m.primary_domain
 FROM kg.public_entries p JOIN kg.revision_reader_metadata m ON m.revision_id=p.revision_id
 WHERE p.locale='en'
 UNION ALL
 SELECT r.entity_id,'en'::text,r.version,r.revision_id,r.title,
        r.summary,r.primary_domain
 FROM kg.studio_public_heads h JOIN kg.studio_public_revisions r
 ON (h.entity_id,h.revision_id,h.version)=(r.entity_id,r.revision_id,r.version);
CREATE FUNCTION kg.publish_studio_draft(p_entity uuid,p_title text,p_body text,p_summary text,p_domain text)
 RETURNS TABLE(entity_id uuid,revision_id uuid,version bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,public AS $$
DECLARE new_version bigint; new_revision uuid;
BEGIN
 IF p_entity IS NULL OR p_title IS NULL OR p_body IS NULL OR p_summary IS NULL OR p_domain IS NULL OR length(btrim(p_summary)) NOT BETWEEN 1 AND 1000 OR length(btrim(p_title)) NOT BETWEEN 1 AND 180
    OR length(btrim(p_body)) NOT BETWEEN 1 AND 100000 THEN
   RAISE EXCEPTION 'INVALID_PUBLICATION';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_entity::text, 5311));
 IF EXISTS(SELECT 1 FROM kg.entities e WHERE e.id=p_entity) THEN
   RAISE EXCEPTION 'EXISTING_KNOWLEDGE_ID';
 END IF;
 SELECT coalesce(max(r.version),0)+1 INTO new_version
   FROM kg.studio_public_revisions r WHERE r.entity_id=p_entity;
 INSERT INTO kg.studio_public_revisions(entity_id,version,title,body,summary,primary_domain)
 VALUES(p_entity,new_version,btrim(p_title),p_body,p_summary,p_domain) RETURNING studio_public_revisions.revision_id INTO new_revision;
 INSERT INTO kg.studio_public_heads(entity_id,revision_id,version)
 VALUES(p_entity,new_revision,new_version)
 ON CONFLICT ON CONSTRAINT studio_public_heads_pkey DO UPDATE SET revision_id=excluded.revision_id,version=excluded.version;
 RETURN QUERY SELECT p_entity,new_revision,new_version;
END $$;
REVOKE ALL ON kg.studio_public_revisions,kg.studio_public_heads FROM PUBLIC;
REVOKE ALL ON FUNCTION kg.publish_studio_draft(uuid,text,text,text,text) FROM PUBLIC;
COMMIT;
