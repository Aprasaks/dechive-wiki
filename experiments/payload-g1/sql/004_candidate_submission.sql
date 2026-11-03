-- G1 candidate submission experiment ONLY. No production migration.
-- Apply after canonical KG migrations, scoped actor roles, and signed reviewer SQL.
-- psql -v candidate_password=<ephemeral> -v candidate_secret=<ephemeral 64 hex> -f ...
\set ON_ERROR_STOP on
BEGIN;

CREATE ROLE kg_g1_candidate_probe LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
  PASSWORD :'candidate_password';

CREATE TABLE kg.candidate_private_key (
  id smallint PRIMARY KEY CHECK (id=1),
  secret_key bytea NOT NULL CHECK (octet_length(secret_key)=32)
);
INSERT INTO kg.candidate_private_key(id,secret_key)
VALUES(1,decode(:'candidate_secret','hex'));

CREATE TABLE kg.g1_candidates (
  revision_id uuid PRIMARY KEY REFERENCES kg.revisions(id),
  draft_id bigint NOT NULL UNIQUE CHECK(draft_id>0),
  submitted_by bigint NOT NULL CHECK(submitted_by>0),
  source_id uuid NOT NULL REFERENCES kg.sources(id),
  license_declaration text NOT NULL CHECK(
    license_declaration IN ('unknown','public-domain','cc-by-4.0','permission-required')
  ),
  source_review_status text NOT NULL DEFAULT 'pending' CHECK(source_review_status='pending'),
  rights_review_status text NOT NULL DEFAULT 'pending' CHECK(rights_review_status='pending'),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_g1_candidate BEFORE UPDATE OR DELETE ON kg.g1_candidates
FOR EACH ROW EXECUTE FUNCTION kg.no_change();

-- An editorial source/rights declaration is *not* independent verification.
-- It is impossible to approve or publish a candidate in this phase.
-- The next gate must add a separate reviewer-owned rights/claims decision.
CREATE FUNCTION kg.g1_block_unreviewed_candidate_approval()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, kg, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM kg.g1_candidates c WHERE c.revision_id=NEW.revision_id)
  THEN
    RAISE EXCEPTION 'CANDIDATE_REVIEW_AND_RIGHTS_NOT_COMPLETE'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER g1_candidate_requires_independent_review
  BEFORE INSERT ON kg.approvals
  FOR EACH ROW EXECUTE FUNCTION kg.g1_block_unreviewed_candidate_approval();

-- One stable, unambiguous attestation over the exact source, claim, and body.
-- Hashes are fixed 64-char lowercase hex, avoiding delimiter injection.
CREATE FUNCTION kg.g1_candidate_message(
  p_editor bigint,p_draft bigint,p_entity uuid,p_revision uuid,
  p_title text,p_body text,p_locator text,p_description text,
  p_claim text,p_anchor text,p_pinpoint text,p_license text,p_nonce text
) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, kg, pg_temp AS $$
SELECT concat_ws('|','g1-candidate-v1',p_editor::text,p_draft::text,
  p_entity::text,p_revision::text,p_nonce,
  encode(public.digest(convert_to(p_title,'UTF8'),'sha256'),'hex'),
  encode(public.digest(convert_to(p_body,'UTF8'),'sha256'),'hex'),
  encode(public.digest(convert_to(p_locator,'UTF8'),'sha256'),'hex'),
  encode(public.digest(convert_to(p_description,'UTF8'),'sha256'),'hex'),
  encode(public.digest(convert_to(p_claim,'UTF8'),'sha256'),'hex'),
  encode(public.digest(convert_to(p_anchor,'UTF8'),'sha256'),'hex'),
  encode(public.digest(convert_to(p_pinpoint,'UTF8'),'sha256'),'hex'),
  encode(public.digest(convert_to(p_license,'UTF8'),'sha256'),'hex')
)
$$;

CREATE FUNCTION kg.g1_submit_candidate(
  p_editor bigint,p_draft bigint,p_entity uuid,p_revision uuid,
  p_title text,p_body text,p_locator text,p_description text,
  p_claim text,p_anchor text,p_pinpoint text,p_license text,
  p_nonce text,p_signature text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, kg, pg_temp AS $$
DECLARE
  v_key bytea;
  v_message text;
  v_expected text;
  v_source uuid;
BEGIN
  IF session_user <> 'kg_g1_candidate_probe' THEN
    RAISE EXCEPTION 'CANDIDATE_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_editor IS NULL OR p_editor<=0 OR p_draft IS NULL OR p_draft<=0
     OR p_entity IS NULL OR p_revision IS NULL
     OR p_title IS NULL OR p_body IS NULL OR p_locator IS NULL
     OR p_description IS NULL OR p_claim IS NULL OR p_anchor IS NULL
     OR p_pinpoint IS NULL OR p_license IS NULL OR p_nonce IS NULL
     OR p_signature IS NULL
     OR length(btrim(p_title)) NOT BETWEEN 4 AND 180
     OR length(btrim(p_body)) NOT BETWEEN 24 AND 12000
     OR length(btrim(p_locator)) NOT BETWEEN 12 AND 512
     OR p_locator !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+(/[^[:space:]]*)?$'
     OR length(btrim(p_description)) NOT BETWEEN 12 AND 700
     OR length(btrim(p_claim)) NOT BETWEEN 8 AND 700
     OR position(p_claim in p_body)=0
     OR length(btrim(p_anchor)) NOT BETWEEN 2 AND 120
     OR length(btrim(p_pinpoint)) NOT BETWEEN 3 AND 300
     OR p_license NOT IN ('unknown','public-domain','cc-by-4.0','permission-required')
     OR p_nonce !~ '^[a-f0-9]{32}$'
     OR p_signature !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'CANDIDATE_METADATA_INVALID' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff s WHERE s.id=p_editor AND s.role='editor'
  ) THEN
    RAISE EXCEPTION 'CANDIDATE_EDITOR_ID_INVALID' USING ERRCODE='42501';
  END IF;

  SELECT k.secret_key INTO STRICT v_key FROM kg.candidate_private_key k WHERE k.id=1;
  v_message := kg.g1_candidate_message(p_editor,p_draft,p_entity,p_revision,
    p_title,p_body,p_locator,p_description,p_claim,p_anchor,p_pinpoint,p_license,p_nonce);
  v_expected := encode(public.hmac(convert_to(v_message,'UTF8'),v_key,'sha256'),'hex');
  IF v_expected <> p_signature THEN
    RAISE EXCEPTION 'CANDIDATE_SIGNATURE_INVALID' USING ERRCODE='42501';
  END IF;

  -- All KG writes are atomic; any error rolls back entity, revision, source,
  -- claim and candidate record. Never creates approval/head/outbox.
  INSERT INTO kg.entities(id,kind,name) VALUES(p_entity,'concept',p_title);
  INSERT INTO kg.revisions(id,entity_id,locale,body)
    VALUES(p_revision,p_entity,'en',p_body);
  INSERT INTO kg.sources(id,locator,description)
    VALUES(gen_random_uuid(),p_locator,p_description)
    ON CONFLICT(locator) DO NOTHING;
  SELECT id INTO STRICT v_source FROM kg.sources WHERE locator=p_locator;
  INSERT INTO kg.claims(revision_id,claim_key,anchor,statement)
    VALUES(p_revision,'claim-001',p_anchor,p_claim);
  INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer)
    VALUES(p_revision,'claim-001',v_source,'supports',p_pinpoint,'EDITOR_ASSERTED_UNVERIFIED');
  INSERT INTO kg.g1_candidates(revision_id,draft_id,submitted_by,source_id,license_declaration)
    VALUES(p_revision,p_draft,p_editor,v_source,p_license);
  RETURN p_revision;
END $$;

REVOKE ALL ON SCHEMA kg FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION kg.g1_candidate_message(
  bigint,bigint,uuid,uuid,text,text,text,text,text,text,text,text,text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION kg.g1_submit_candidate(
  bigint,bigint,uuid,uuid,text,text,text,text,text,text,text,text,text,text
) FROM PUBLIC;
GRANT USAGE ON SCHEMA kg TO kg_g1_candidate_probe;
GRANT EXECUTE ON FUNCTION kg.g1_submit_candidate(
  bigint,bigint,uuid,uuid,text,text,text,text,text,text,text,text,text,text
) TO kg_g1_candidate_probe;
COMMIT;
