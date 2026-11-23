-- Preserve existing source records; expose an actionable conflict without changing the security gate.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE kg.studio_reviewed_evidence_staged ALTER COLUMN studio_revision_id DROP NOT NULL;
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
 SELECT s.* INTO sr FROM kg.studio_public_heads h JOIN kg.studio_public_revisions s
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
 INSERT INTO kg.revision_reader_metadata(revision_id,title,summary,primary_domain) VALUES(r,coalesce(sr.title,v->>'title'),coalesce(sr.summary,'Private review awaiting publication'),coalesce(sr.primary_domain,'science'));
 FOR item IN SELECT value FROM jsonb_array_elements(v->'rows') LOOP
  IF coalesce(item->>'claimKey','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
   OR length(btrim(coalesce(item->>'anchor','')))=0 OR length(btrim(coalesce(item->>'statement','')))=0
   OR position(item->>'statement' IN (v->>'body'))=0 OR coalesce(item->>'locator','') !~ '^https://[^[:space:]]+$'
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
  SELECT id INTO source_id FROM kg.sources WHERE locator=item->>'locator' AND description=item->>'description';
  IF source_id IS NULL THEN
   RAISE EXCEPTION 'SOURCE_TITLE_CONFLICT' USING ERRCODE='23505';
  END IF;
  INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer)
  VALUES(r,item->>'claimKey',source_id,'supports',item->>'pinpoint',v->>'reviewerId');
 END LOOP;
 INSERT INTO kg.studio_reviewed_evidence_staged(revision_id,studio_revision_id,review_id,reviewer_id,editor_id,payload_digest,payload)
 VALUES(r,sr.revision_id,(v->>'reviewId')::bigint,(v->>'reviewerId')::bigint,(v->>'editorId')::bigint,v_digest,v);
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION kg.approve_studio_reviewed_evidence(p_revision uuid,p_reviewer bigint,p_nonce text,p_signature text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
DECLARE stage kg.studio_reviewed_evidence_staged%ROWTYPE; v_key bytea; expected text; entity uuid;
BEGIN
 IF session_user<>'kg_g1_reviewer_probe' OR p_revision IS NULL OR p_reviewer IS NULL OR p_reviewer<1
 OR coalesce(p_nonce,'') !~ '^[a-f0-9]{32}$' OR coalesce(p_signature,'') !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'INVALID_REVIEW_APPROVAL' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT stage FROM kg.studio_reviewed_evidence_staged WHERE revision_id=p_revision AND reviewer_id=p_reviewer;
 SELECT entity_id INTO STRICT entity FROM kg.revisions WHERE id=p_revision;
 PERFORM pg_advisory_xact_lock(hashtextextended(entity::text,5311));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_revision::text,7007));
 IF stage.studio_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM kg.studio_public_heads h JOIN kg.studio_public_revisions s
 ON (h.entity_id,h.revision_id,h.version)=(s.entity_id,s.revision_id,s.version)
 JOIN kg.revisions r ON r.id=p_revision AND r.entity_id=s.entity_id AND r.body=s.body
 JOIN kg.revision_reader_metadata m ON m.revision_id=r.id AND m.title=s.title
 WHERE h.entity_id=entity AND s.revision_id=stage.studio_revision_id)
 THEN RAISE EXCEPTION 'PUBLICATION_CHANGED_SINCE_REVIEW' USING ERRCODE='23514'; END IF;
 SELECT secret_key INTO STRICT v_key FROM kg.attestation_private_key WHERE id=1;
 expected:=encode(public.hmac(convert_to('studio-reviewed-approval-v1|'||p_revision::text||'|'||p_reviewer::text||'|'||stage.payload_digest||'|'||p_nonce,'UTF8'),v_key,'sha256'),'hex');
 IF expected<>p_signature THEN RAISE EXCEPTION 'INVALID_REVIEW_APPROVAL_SIGNATURE' USING ERRCODE='42501'; END IF;
 INSERT INTO kg.studio_reviewed_approval_attestations(revision_id,reviewer_id,payload_digest,nonce,signature)
 VALUES(p_revision,p_reviewer,stage.payload_digest,p_nonce,p_signature);
 INSERT INTO kg.approvals(revision_id,reviewer) VALUES(p_revision,'staff:'||p_reviewer::text);
END $$;
CREATE OR REPLACE FUNCTION kg.link_studio_approved_evidence(p_studio_revision uuid,p_approved_revision uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
BEGIN
 IF p_studio_revision IS NULL OR p_approved_revision IS NULL OR NOT EXISTS (
  SELECT 1 FROM kg.studio_public_revisions s
  JOIN kg.revisions r ON r.id=p_approved_revision AND r.entity_id=s.entity_id AND r.locale='en' AND r.body=s.body
  JOIN kg.approvals a ON a.revision_id=r.id
  JOIN kg.revision_reader_metadata m ON m.revision_id=r.id AND m.title=s.title
  WHERE s.revision_id=p_studio_revision
  AND NOT EXISTS(SELECT 1 FROM kg.studio_reviewed_evidence_staged z WHERE z.revision_id=r.id AND z.studio_revision_id IS DISTINCT FROM s.revision_id)
 ) THEN RAISE EXCEPTION 'APPROVED_REVISION_MISMATCH' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM kg.claims c JOIN kg.claim_evidence e
  ON e.revision_id=c.revision_id AND e.claim_key=c.claim_key
  WHERE c.revision_id=p_approved_revision) THEN
  RAISE EXCEPTION 'APPROVED_EVIDENCE_REQUIRED' USING ERRCODE='23514';
 END IF;
 INSERT INTO kg.studio_approved_evidence_links(studio_revision_id,approved_revision_id)
 VALUES(p_studio_revision,p_approved_revision);
END $$;

CREATE OR REPLACE FUNCTION kg.auto_link_studio_approved_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
DECLARE target_entity uuid;
BEGIN
 IF TG_TABLE_NAME='approvals' THEN
  SELECT entity_id INTO STRICT target_entity FROM kg.revisions WHERE id=NEW.revision_id;
 ELSE target_entity:=NEW.entity_id;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target_entity::text,5311));
 INSERT INTO kg.studio_approved_evidence_links(studio_revision_id,approved_revision_id)
 SELECT s.revision_id,(array_agg(r.id ORDER BY r.id))[1]
 FROM kg.studio_public_revisions s
 JOIN kg.revisions r ON r.entity_id=s.entity_id AND r.locale='en' AND r.body=s.body
 JOIN kg.approvals a ON a.revision_id=r.id
 JOIN kg.revision_reader_metadata m ON m.revision_id=r.id AND m.title=s.title
 WHERE s.entity_id=target_entity
 AND NOT EXISTS(SELECT 1 FROM kg.studio_reviewed_evidence_staged z WHERE z.revision_id=r.id AND z.studio_revision_id IS DISTINCT FROM s.revision_id)
 AND EXISTS (
  SELECT 1 FROM kg.claims c JOIN kg.claim_evidence e
  ON e.revision_id=c.revision_id AND e.claim_key=c.claim_key
  WHERE c.revision_id=r.id)
 GROUP BY s.revision_id HAVING count(*)=1
 ON CONFLICT(studio_revision_id) DO NOTHING;
 RETURN NEW;
END $$;


COMMIT;
