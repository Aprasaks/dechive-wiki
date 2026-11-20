-- Apply only after reviewing a backup and deploying the matching application.
-- Historical payloads without reviewMode remain independent by default.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE kg.studio_reviewed_evidence_staged DROP CONSTRAINT studio_reviewed_evidence_staged_check;
ALTER TABLE kg.studio_reviewed_evidence_staged ADD CONSTRAINT studio_reviewed_evidence_staged_mode_check CHECK (
 editor_id > 0 AND (
  (coalesce(payload->>'reviewMode','independent')='independent' AND editor_id<>reviewer_id)
  OR (payload->>'reviewMode'='operator' AND editor_id=reviewer_id)
 ));
CREATE OR REPLACE FUNCTION kg.stage_studio_reviewed_evidence(p_payload text,p_nonce text,p_signature text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
DECLARE v jsonb; v_digest text; v_key bytea; v_signature text; e uuid; r uuid;
 sr kg.studio_public_revisions%ROWTYPE; item jsonb; asset jsonb; source_id uuid; claim_ids text[]:=ARRAY[]::text[];
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
 OR coalesce(v->>'reviewMode','independent') NOT IN ('independent','operator')
 OR (coalesce(v->>'reviewMode','independent')='independent' AND v->>'reviewerId'=v->>'editorId')
 OR (v->>'reviewMode'='operator' AND v->>'reviewerId'<>v->>'editorId')
 OR coalesce(v->>'snapshotHash','') !~ '^[a-f0-9]{64}$'
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
 -- Bind reviewed image checksums to the actual immutable media bytes.
 IF jsonb_typeof(v->'reviewSnapshot'->'media') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'INVALID_MEDIA_SNAPSHOT' USING ERRCODE='23514'; END IF;
 FOR asset IN SELECT value FROM jsonb_array_elements(v->'reviewSnapshot'->'media') LOOP
  IF coalesce(asset->>'objectKey','') !~ '^media/[0-9a-fA-F-]{36}$' OR
   coalesce(asset->>'sha256','') !~ '^[0-9a-fA-F]{64}$' OR NOT EXISTS (
    SELECT 1 FROM kg.studio_media m WHERE m.entity_id=e
     AND m.id=substring(asset->>'objectKey' FROM 7)::uuid
     AND encode(public.digest(m.data,'sha256'),'hex')=lower(asset->>'sha256'))
  THEN RAISE EXCEPTION 'REVIEWED_IMAGE_MISMATCH' USING ERRCODE='23514'; END IF;
 END LOOP;
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
COMMIT;
