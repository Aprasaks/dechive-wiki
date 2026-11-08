-- Disposable CI experiment only. Staging is neither approval nor publication.
BEGIN;
CREATE TABLE kg.multi_evidence_staged (
 revision_id uuid PRIMARY KEY REFERENCES kg.multi_source_snapshots(revision_id),
 staged_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER multi_evidence_staged_immutable BEFORE UPDATE OR DELETE ON kg.multi_evidence_staged
 FOR EACH ROW EXECUTE FUNCTION kg.no_change();

CREATE FUNCTION kg.lock_staged_multi_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
 PERFORM pg_advisory_xact_lock(hashtextextended(target::text,7007));
 IF TG_OP='UPDATE' AND OLD.revision_id IS DISTINCT FROM NEW.revision_id THEN
  RAISE EXCEPTION 'REVISION_CHANGE_FORBIDDEN' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM kg.multi_evidence_staged WHERE revision_id=target) THEN
  RAISE EXCEPTION 'STAGED_MULTI_EVIDENCE_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lock_staged_multi_claim BEFORE INSERT OR UPDATE OR DELETE ON kg.claims
 FOR EACH ROW EXECUTE FUNCTION kg.lock_staged_multi_evidence();
CREATE TRIGGER lock_staged_multi_links BEFORE INSERT OR UPDATE OR DELETE ON kg.claim_evidence
 FOR EACH ROW EXECUTE FUNCTION kg.lock_staged_multi_evidence();

CREATE FUNCTION kg.stage_multi_evidence(p_revision uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
DECLARE pkg jsonb; review_record text; c jsonb; source jsonb; decision jsonb;
 source_id text; actual_source uuid; reviewed_by text; pairs integer:=0;
BEGIN
 IF session_user<>'kg_g1_candidate_probe' OR p_revision IS NULL THEN
  RAISE EXCEPTION 'STAGING_ROLE_REQUIRED' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_revision::text,7007));
 SELECT package_data,review_record_id INTO STRICT pkg,review_record
 FROM kg.multi_source_snapshots WHERE revision_id=p_revision;
 IF EXISTS(SELECT 1 FROM kg.multi_evidence_staged WHERE revision_id=p_revision)
    OR EXISTS(SELECT 1 FROM kg.claims WHERE revision_id=p_revision)
    OR EXISTS(SELECT 1 FROM kg.approvals WHERE revision_id=p_revision)
    OR jsonb_typeof(pkg->'reviewEvidence') IS DISTINCT FROM 'array'
    OR jsonb_typeof(pkg->'reviewMedia') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'MULTI_STAGE_INVALID_STATE' USING ERRCODE='23514';
 END IF;
 SELECT reviewer_id INTO STRICT reviewed_by FROM public.multi_source_reviews WHERE id=review_record::bigint;
 FOR c IN SELECT value FROM jsonb_array_elements(pkg->'claims') LOOP
  INSERT INTO kg.claims(revision_id,claim_key,anchor,statement)
  VALUES(p_revision,c->>'id',c->>'anchor',c->>'statement');
  FOR source_id IN SELECT value FROM jsonb_array_elements_text(c->'sourceIds') LOOP
   pairs:=pairs+1;
   SELECT value INTO STRICT source FROM jsonb_array_elements(pkg->'sources') WHERE value->>'id'=source_id;
   SELECT value INTO STRICT decision FROM jsonb_array_elements(pkg->'reviewEvidence')
    WHERE value->>'claimId'=c->>'id' AND value->>'sourceId'=source_id;
   IF decision->>'verdict' IS DISTINCT FROM 'verified'
      OR length(btrim(coalesce(decision->>'note','')))=0
      OR length(btrim(coalesce(decision->>'pinpoint','')))=0 THEN
    RAISE EXCEPTION 'MULTI_EVIDENCE_NOT_REVIEWED' USING ERRCODE='23514';
   END IF;
   INSERT INTO kg.sources(id,locator,description)
    VALUES(gen_random_uuid(),source->>'url',source->>'description')
    ON CONFLICT(locator) DO NOTHING;
   SELECT id INTO STRICT actual_source FROM kg.sources
    WHERE locator=source->>'url' AND description=source->>'description';
   INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer)
    VALUES(p_revision,c->>'id',actual_source,'supports',decision->>'pinpoint',reviewed_by);
  END LOOP;
 END LOOP;
 IF pairs=0 OR pairs<>jsonb_array_length(pkg->'reviewEvidence') THEN
  RAISE EXCEPTION 'MULTI_REVIEW_DECISION_MISMATCH' USING ERRCODE='23514';
 END IF;
 INSERT INTO kg.multi_evidence_staged(revision_id) VALUES(p_revision);
END $$;
REVOKE ALL ON kg.multi_evidence_staged FROM PUBLIC,kg_public_http,kg_g1_candidate_probe,kg_g1_reviewer_probe;
REVOKE ALL ON FUNCTION kg.stage_multi_evidence(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kg.stage_multi_evidence(uuid) TO kg_g1_candidate_probe;
COMMIT;
