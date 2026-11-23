\set ON_ERROR_STOP on
BEGIN;
-- Only a signed, approved snapshot matching the current private package can be published.
CREATE OR REPLACE FUNCTION kg.publish_reviewed_studio_draft(p_entity uuid,p_title text,p_body text,p_summary text,p_domain text,p_hash text,p_editor bigint)
RETURNS TABLE(entity_id uuid,revision_id uuid,version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,public AS $$
DECLARE approved_revision uuid; new_version bigint; new_revision uuid;
BEGIN
 IF session_user <> 'kg_studio_publish' OR p_entity IS NULL OR p_editor IS NULL OR p_editor<1
 OR coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' OR length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 180
 OR length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 100000 OR length(btrim(coalesce(p_summary,''))) NOT BETWEEN 1 AND 1000
 OR p_domain NOT IN ('science','technology','humanities','philosophy','history','society','economics','health','life','space','earth','arts-culture')
 THEN RAISE EXCEPTION 'INVALID_PUBLICATION' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_entity::text,5311));
 SELECT s.revision_id INTO approved_revision FROM kg.studio_reviewed_evidence_staged s
 JOIN kg.studio_reviewed_approval_attestations a ON a.revision_id=s.revision_id AND a.payload_digest=s.payload_digest AND a.reviewer_id=s.reviewer_id
 JOIN kg.approvals ap ON ap.revision_id=s.revision_id
 JOIN kg.revisions r ON r.id=s.revision_id AND r.entity_id=p_entity AND r.body=p_body
 JOIN kg.revision_reader_metadata m ON m.revision_id=r.id AND m.title=p_title
 WHERE s.editor_id=p_editor AND s.payload->>'snapshotHash'=p_hash AND s.payload->>'entityId'=p_entity::text
 AND s.payload->>'title'=p_title AND s.payload->>'body'=p_body
 AND s.studio_revision_id IS NULL
 ORDER BY s.staged_at DESC, s.revision_id DESC LIMIT 1;
 IF approved_revision IS NULL THEN RAISE EXCEPTION 'CURRENT_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM kg.heads h WHERE h.entity_id=p_entity AND h.locale='en') THEN
  RAISE EXCEPTION 'EXISTING_KNOWLEDGE_ID' USING ERRCODE='23514'; END IF;
 SELECT coalesce(max(s.version),0)+1 INTO new_version FROM kg.studio_public_revisions s WHERE s.entity_id=p_entity;
 INSERT INTO kg.studio_public_revisions(entity_id,version,title,body,summary,primary_domain)
 VALUES(p_entity,new_version,p_title,p_body,p_summary,p_domain) RETURNING studio_public_revisions.revision_id INTO new_revision;
 INSERT INTO kg.studio_approved_evidence_links(studio_revision_id,approved_revision_id) VALUES(new_revision,approved_revision);
 INSERT INTO kg.studio_public_heads(entity_id,revision_id,version) VALUES(p_entity,new_revision,new_version)
 ON CONFLICT ON CONSTRAINT studio_public_heads_pkey DO UPDATE SET revision_id=excluded.revision_id,version=excluded.version;
 RETURN QUERY SELECT p_entity,new_revision,new_version;
END $$;
REVOKE ALL ON FUNCTION kg.publish_reviewed_studio_draft(uuid,text,text,text,text,text,bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION kg.publish_studio_draft(uuid,text,text,text,text) FROM kg_studio_publish;
GRANT EXECUTE ON FUNCTION kg.publish_reviewed_studio_draft(uuid,text,text,text,text,text,bigint) TO kg_studio_publish;
COMMIT;
