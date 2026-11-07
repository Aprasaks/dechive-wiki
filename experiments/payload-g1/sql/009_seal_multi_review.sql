-- Synthetic CI experiment only. Sealing is not approval or publication.
\set ON_ERROR_STOP on
BEGIN;
CREATE UNIQUE INDEX multi_snapshot_review_once ON kg.multi_source_snapshots(review_record_id);
CREATE FUNCTION kg.seal_multi_review(p_entity uuid,p_revision uuid,p_review bigint,p_reviewer bigint,p_nonce text,p_signature text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
DECLARE v_review record; v_key bytea; v_expected text; v_message text; v_package jsonb;
BEGIN
 IF session_user<>'kg_g1_candidate_probe' OR p_entity IS NULL OR p_revision IS NULL
    OR p_review IS NULL OR p_review<1 OR p_reviewer IS NULL OR p_reviewer<1
    OR p_nonce !~ '^[a-f0-9]{32}$' OR p_signature !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'INVALID_SEAL_REQUEST' USING ERRCODE='42501'; END IF;
 -- Payload's review is server-generated, role checked and immutable via its API.
 SELECT * INTO STRICT v_review FROM public.multi_source_reviews WHERE id=p_review;
 IF v_review.snapshot_entity_id IS DISTINCT FROM p_entity::text
    OR v_review.reviewer_id IS DISTINCT FROM p_reviewer::text
    OR v_review.editor_id=v_review.reviewer_id
    OR NOT EXISTS (SELECT 1 FROM public.staff WHERE id=p_reviewer AND role='reviewer') THEN
  RAISE EXCEPTION 'REVIEW_IDENTITY_MISMATCH' USING ERRCODE='42501'; END IF;
 SELECT secret_key INTO STRICT v_key FROM kg.candidate_private_key WHERE id=1;
 v_message:=concat_ws('|','g1-multi-seal-v1',p_entity::text,p_revision::text,p_review::text,p_reviewer::text,v_review.snapshot_hash,p_nonce);
 v_expected:=encode(public.hmac(convert_to(v_message,'UTF8'),v_key,'sha256'),'hex');
 IF v_expected<>p_signature THEN RAISE EXCEPTION 'SEAL_SIGNATURE_INVALID' USING ERRCODE='42501'; END IF;
 v_package:=v_review.snapshot::jsonb;
 INSERT INTO kg.entities(id,kind,name) VALUES(p_entity,'concept',v_package->>'title') ON CONFLICT(id) DO NOTHING;
 INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES(p_revision,p_entity,'en',v_package->>'body');
 INSERT INTO kg.multi_source_snapshots(revision_id,review_record_id,package_digest,package_data)
 VALUES(p_revision,p_review::text,encode(public.digest(convert_to(v_package::text,'UTF8'),'sha256'),'hex'),v_package);
 RETURN p_revision;
END $$;
REVOKE ALL ON FUNCTION kg.seal_multi_review(uuid,uuid,bigint,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kg.seal_multi_review(uuid,uuid,bigint,bigint,text,text) TO kg_g1_candidate_probe;
COMMIT;
