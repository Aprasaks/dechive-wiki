-- G1 independent reviewer decision experiment; requires 001-004 KG/role/candidate setup.
-- Synthetic-only PostgreSQL 17.6. This is NOT a live legal or factual verification service.
\set ON_ERROR_STOP on
BEGIN;

CREATE TABLE kg.g1_review_decisions (
  revision_id uuid PRIMARY KEY REFERENCES kg.g1_candidates(revision_id),
  reviewer_staff_id bigint NOT NULL CHECK(reviewer_staff_id>0),
  revision_checksum text NOT NULL CHECK(revision_checksum ~ '^[0-9a-f]{64}$'),
  decision text NOT NULL CHECK(decision IN ('accepted','rejected')),
  source_verdict text NOT NULL CHECK(source_verdict IN ('verified','unverified','disputed')),
  rights_verdict text NOT NULL CHECK(rights_verdict IN ('cleared','not-cleared')),
  review_note text NOT NULL CHECK(length(btrim(review_note)) BETWEEN 20 AND 2000),
  nonce text NOT NULL CHECK(nonce ~ '^[0-9a-f]{32}$'),
  signature text NOT NULL CHECK(signature ~ '^[0-9a-f]{64}$'),
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(decision <> 'accepted' OR (source_verdict='verified' AND rights_verdict='cleared'))
);
CREATE TRIGGER immutable_g1_review_decision
  BEFORE UPDATE OR DELETE ON kg.g1_review_decisions
  FOR EACH ROW EXECUTE FUNCTION kg.no_change();

-- After candidate creation, claim/evidence cannot be silently swapped before
-- a reviewer decision (a separate snapshot must be submitted instead).
CREATE FUNCTION kg.g1_lock_candidate_claims() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog, kg, pg_temp AS $$
DECLARE v_revision uuid;
BEGIN
  v_revision := CASE WHEN TG_OP='DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
  IF EXISTS(SELECT 1 FROM kg.g1_candidates c WHERE c.revision_id=v_revision)
  THEN RAISE EXCEPTION 'CANDIDATE_CLAIM_EVIDENCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER g1_lock_candidate_claims
  BEFORE INSERT OR UPDATE OR DELETE ON kg.claims
  FOR EACH ROW EXECUTE FUNCTION kg.g1_lock_candidate_claims();
CREATE TRIGGER g1_lock_candidate_evidence
  BEFORE INSERT OR UPDATE OR DELETE ON kg.claim_evidence
  FOR EACH ROW EXECUTE FUNCTION kg.g1_lock_candidate_claims();

-- Existing 004 trigger previously denied *all* candidate approval; now it
-- demands a separately HMAC-validated and immutable accepted decision.
CREATE OR REPLACE FUNCTION kg.g1_block_unreviewed_candidate_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,kg,pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM kg.g1_candidates c WHERE c.revision_id=NEW.revision_id)
     AND NOT EXISTS (
       SELECT 1 FROM kg.g1_review_decisions d
       JOIN kg.revisions r ON r.id=d.revision_id
       WHERE d.revision_id=NEW.revision_id AND d.decision='accepted'
         AND d.source_verdict='verified' AND d.rights_verdict='cleared'
         AND d.revision_checksum=r.checksum
     ) THEN
    RAISE EXCEPTION 'CANDIDATE_REVIEW_AND_RIGHTS_NOT_COMPLETE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

-- Review decision must be bound to the actual signed-in staff reviewer and
-- the immutable SHA-256 snapshot; only server-side trusted HMAC key can sign.
CREATE FUNCTION kg.g1_record_review_decision(
  p_revision uuid,p_reviewer bigint,p_decision text,
  p_source_verdict text,p_rights_verdict text,p_note text,
  p_nonce text,p_signature text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,kg,pg_temp AS $$
DECLARE v_candidate kg.g1_candidates%ROWTYPE;
        v_checksum text;
        v_key bytea;
        v_payload text;
        v_expected text;
BEGIN
  IF session_user <> 'kg_g1_reviewer_probe' THEN
    RAISE EXCEPTION 'REVIEWER_DB_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_revision IS NULL OR p_reviewer IS NULL OR p_reviewer<1
     OR p_decision IS NULL OR p_source_verdict IS NULL OR p_rights_verdict IS NULL
     OR p_note IS NULL OR p_nonce IS NULL OR p_signature IS NULL
     OR p_decision NOT IN ('accepted','rejected')
     OR p_source_verdict NOT IN ('verified','unverified','disputed')
     OR p_rights_verdict NOT IN ('cleared','not-cleared')
     OR length(btrim(p_note)) NOT BETWEEN 20 AND 2000
     OR p_nonce !~ '^[0-9a-f]{32}$'
     OR p_signature !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'REVIEW_DECISION_METADATA_INVALID' USING ERRCODE='23514';
  END IF;

  SELECT * INTO STRICT v_candidate FROM kg.g1_candidates
   WHERE revision_id=p_revision FOR UPDATE;
  SELECT checksum INTO STRICT v_checksum FROM kg.revisions WHERE id=p_revision;

  IF NOT EXISTS (SELECT 1 FROM public.staff s
     WHERE s.id=p_reviewer AND s.role='reviewer') THEN
    RAISE EXCEPTION 'REVIEWER_ID_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF p_reviewer=v_candidate.submitted_by THEN
    RAISE EXCEPTION 'SELF_REVIEW_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_decision='accepted'
     AND (p_source_verdict<>'verified' OR p_rights_verdict<>'cleared'
       OR v_candidate.license_declaration NOT IN ('public-domain','cc-by-4.0')) THEN
    RAISE EXCEPTION 'CLAIM_OR_RIGHTS_NOT_CLEARED' USING ERRCODE='23514';
  END IF;
  SELECT secret_key INTO STRICT v_key FROM kg.attestation_private_key WHERE id=1;
  v_payload := concat_ws('|','g1-review-decision-v1',p_reviewer::text,
    p_revision::text,v_checksum,p_decision,p_source_verdict,p_rights_verdict,
    encode(public.digest(convert_to(p_note,'UTF8'),'sha256'),'hex'),p_nonce);
  v_expected := encode(public.hmac(convert_to(v_payload,'UTF8'),v_key,'sha256'),'hex');
  IF v_expected <> p_signature THEN
    RAISE EXCEPTION 'REVIEW_DECISION_SIGNATURE_INVALID' USING ERRCODE='42501';
  END IF;
  INSERT INTO kg.g1_review_decisions(
    revision_id,reviewer_staff_id,revision_checksum,decision,
    source_verdict,rights_verdict,review_note,nonce,signature
  ) VALUES(p_revision,p_reviewer,v_checksum,p_decision,
    p_source_verdict,p_rights_verdict,p_note,p_nonce,p_signature);
  RETURN p_decision;
END $$;

REVOKE ALL ON FUNCTION kg.g1_record_review_decision(
  uuid,bigint,text,text,text,text,text,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kg.g1_record_review_decision(
  uuid,bigint,text,text,text,text,text,text
) TO kg_g1_reviewer_probe;
GRANT SELECT ON kg.g1_candidates,kg.g1_review_decisions TO kg_g1_reviewer_probe;
COMMIT;
