-- Cross-database staging: the authenticated private studio signs the complete
-- review payload; this function does NOT grant approval or publish anything.
-- Requires a dedicated kg_g1_candidate_probe login and a separately provisioned
-- kg.candidate_private_key. Never use test credentials in production.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE kg.studio_reviewed_evidence_staged (
 revision_id uuid PRIMARY KEY REFERENCES kg.revisions(id),
 studio_revision_id uuid NOT NULL REFERENCES kg.studio_public_revisions(revision_id),
 review_id bigint NOT NULL UNIQUE CHECK(review_id>0),
 reviewer_id bigint NOT NULL CHECK(reviewer_id>0),
 editor_id bigint NOT NULL CHECK(editor_id>0 AND editor_id<>reviewer_id),
 payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL,
 staged_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER studio_reviewed_evidence_staged_immutable BEFORE UPDATE OR DELETE
 ON kg.studio_reviewed_evidence_staged FOR EACH ROW EXECUTE FUNCTION kg.no_change();
REVOKE ALL ON kg.studio_reviewed_evidence_staged FROM PUBLIC,kg_public_http,kg_g1_candidate_probe;

-- Freeze staged claim and source associations, including against concurrent edits.
CREATE FUNCTION kg.lock_studio_staged_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
 IF TG_OP='UPDATE' AND OLD.revision_id IS DISTINCT FROM NEW.revision_id THEN
  RAISE EXCEPTION 'REVISION_CHANGE_FORBIDDEN' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target::text,7007));
 IF EXISTS(SELECT 1 FROM kg.studio_reviewed_evidence_staged WHERE revision_id=target) THEN
  RAISE EXCEPTION 'STUDIO_STAGED_EVIDENCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER studio_staged_claim_lock BEFORE INSERT OR UPDATE OR DELETE ON kg.claims
 FOR EACH ROW EXECUTE FUNCTION kg.lock_studio_staged_evidence();
CREATE TRIGGER studio_staged_evidence_lock BEFORE INSERT OR UPDATE OR DELETE ON kg.claim_evidence
 FOR EACH ROW EXECUTE FUNCTION kg.lock_studio_staged_evidence();

-- This staging step must never become approval through an older DB entry point.
CREATE FUNCTION kg.block_unapproved_studio_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM kg.studio_reviewed_evidence_staged WHERE revision_id=NEW.revision_id)
 THEN RAISE EXCEPTION 'STUDIO_EVIDENCE_APPROVAL_NOT_IMPLEMENTED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER studio_review_approval_block BEFORE INSERT ON kg.approvals
 FOR EACH ROW EXECUTE FUNCTION kg.block_unapproved_studio_review();

CREATE FUNCTION kg.stage_studio_reviewed_evidence(p_payload text,p_nonce text,p_signature text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
DECLARE v jsonb; v_digest text; v_key bytea; v_signature text; e uuid; r uuid;
 sr kg.studio_public_revisions%ROWTYPE; item jsonb; source_id uuid; claim_ids text[]:=ARRAY[]::text[];
BEGIN
 IF session_user<>'kg_g1_candidate_probe' OR p_payload IS NULL OR length(p_payload)>1000000
 OR coalesce(p_nonce,'') !~ '^[a-f0-9]{32}$' OR coalesce(p_signature,'') !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'INVALID_STAGE_REQUEST' USING ERRCODE='42501'; END IF;
 v_digest:=encode(public.digest(convert_to(p_payload,'UTF8'),'sha256'),'hex');
 SELECT secret_key INTO STRICT v_key FROM kg.candidate_private_key WHERE id=1;
 v_signature:=encode(public.hmac(convert_to('studio-reviewed-stage-v1|'||v_digest||'|'||p_nonce,'UTF8'),v_key,'sha256'),'hex');
 IF v_signature<>p_signature THEN RAISE EXCEPTION 'INVALID_STAGE_SIGNATURE' USING ERRCODE='42501'; END IF;
 v:=p_payload::jsonb; e:=(v->>'entityId')::uuid; r:=(v->>'revisionId')::uuid;
 IF (v->>'reviewId')::bigint<1 OR (v->>'reviewerId')::bigint<1 OR (v->>'editorId')::bigint<1
 OR v->>'reviewerId'=v->>'editorId' OR coalesce(v->>'snapshotHash','') !~ '^[a-f0-9]{64}$'
 OR jsonb_typeof(v->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'rows')=0
 OR jsonb_array_length(v->'rows')>500 OR jsonb_typeof(v->'reviewSnapshot') IS DISTINCT FROM 'object'
 OR jsonb_typeof(v->'reviewEvidence') IS DISTINCT FROM 'array' OR jsonb_typeof(v->'reviewMedia') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'INVALID_STAGE_PAYLOAD' USING ERRCODE='23514'; END IF;
 -- Serialize against studio publication and against evidence edits.
 PERFORM pg_advisory_xact_lock(hashtextextended(e::text,5311));
 PERFORM pg_advisory_xact_lock(hashtextextended(r::text,7007));
 -- Only the exact current studio publication may receive this staged record.
 SELECT s.* INTO STRICT sr FROM kg.studio_public_heads h JOIN kg.studio_public_revisions s
 ON (h.entity_id,h.revision_id,h.version)=(s.entity_id,s.revision_id,s.version)
 WHERE h.entity_id=e AND s.title=v->>'title' AND s.body=v->>'body';
 INSERT INTO kg.entities(id,kind,name) VALUES(e,'concept',v->>'title') ON CONFLICT(id) DO NOTHING;
 INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES(r,e,'en',v->>'body');
 INSERT INTO kg.revision_reader_metadata(revision_id,title,summary,primary_domain) VALUES(r,sr.title,sr.summary,sr.primary_domain);
 FOR item IN SELECT value FROM jsonb_array_elements(v->'rows') LOOP
  IF coalesce(item->>'claimKey','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
   OR length(btrim(coalesce(item->>'anchor','')))=0 OR length(btrim(coalesce(item->>'statement','')))=0
   OR position(item->>'statement' IN sr.body)=0 OR coalesce(item->>'locator','') !~ '^https://[^[:space:]]+$'
   OR length(btrim(coalesce(item->>'description','')))=0 OR length(btrim(coalesce(item->>'pinpoint','')))=0
   OR item->>'stance' IS DISTINCT FROM 'supports'
  THEN RAISE EXCEPTION 'INVALID_STAGED_EVIDENCE' USING ERRCODE='23514'; END IF;
  IF NOT (item->>'claimKey'=ANY(claim_ids)) THEN
   INSERT INTO kg.claims(revision_id,claim_key,anchor,statement) VALUES(r,item->>'claimKey',item->>'anchor',item->>'statement');
   claim_ids:=array_append(claim_ids,item->>'claimKey');
  ELSIF NOT EXISTS(SELECT 1 FROM kg.claims WHERE revision_id=r AND claim_key=item->>'claimKey' AND anchor=item->>'anchor' AND statement=item->>'statement') THEN
   RAISE EXCEPTION 'INCONSISTENT_STAGED_CLAIM' USING ERRCODE='23514';
  END IF;
  INSERT INTO kg.sources(id,locator,description) VALUES(gen_random_uuid(),item->>'locator',item->>'description') ON CONFLICT(locator) DO NOTHING;
  SELECT id INTO STRICT source_id FROM kg.sources WHERE locator=item->>'locator' AND description=item->>'description';
  INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer)
  VALUES(r,item->>'claimKey',source_id,'supports',item->>'pinpoint',v->>'reviewerId');
 END LOOP;
 INSERT INTO kg.studio_reviewed_evidence_staged(revision_id,studio_revision_id,review_id,reviewer_id,editor_id,payload_digest,payload)
 VALUES(r,sr.revision_id,(v->>'reviewId')::bigint,(v->>'reviewerId')::bigint,(v->>'editorId')::bigint,v_digest,v);
 RETURN r;
END $$;
GRANT USAGE ON SCHEMA kg TO kg_g1_candidate_probe;
REVOKE ALL ON FUNCTION kg.stage_studio_reviewed_evidence(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kg.stage_studio_reviewed_evidence(text,text,text) TO kg_g1_candidate_probe;
COMMIT;
