BEGIN;
CREATE OR REPLACE FUNCTION kg.publish_studio_draft(p_entity uuid,p_title text,p_body text,p_summary text,p_domain text)
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

CREATE OR REPLACE FUNCTION kg.studio_public_state(p_entity uuid)
 RETURNS TABLE(revision_id uuid, version bigint, summary text, primary_domain text)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,kg AS $$
 SELECT r.revision_id,r.version,r.summary,r.primary_domain
 FROM kg.studio_public_heads h JOIN kg.studio_public_revisions r
 ON (h.entity_id,h.revision_id,h.version)=(r.entity_id,r.revision_id,r.version)
 WHERE h.entity_id=p_entity
$$;
CREATE OR REPLACE FUNCTION kg.unpublish_studio_draft(p_entity uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg AS $$
DECLARE removed integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_entity::text,5311));
 DELETE FROM kg.studio_public_heads WHERE entity_id=p_entity;
 GET DIAGNOSTICS removed = ROW_COUNT;
 RETURN removed > 0;
END $$;
REVOKE ALL ON FUNCTION kg.studio_public_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION kg.unpublish_studio_draft(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kg.studio_public_state(uuid) TO kg_studio_publish;
GRANT EXECUTE ON FUNCTION kg.unpublish_studio_draft(uuid) TO kg_studio_publish;
COMMIT;
