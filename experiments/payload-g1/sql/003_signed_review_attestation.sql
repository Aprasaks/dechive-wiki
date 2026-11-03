-- G1 synthetic CI experiment ONLY.
-- Requires canonical KG schema, 002_actor_roles, and Payload's public.staff table
-- at execution time of the function (not at function definition).
-- Private key is supplied at runtime with psql -v attestation_secret=<random 64 hex>.
\set ON_ERROR_STOP on
BEGIN;

CREATE TABLE kg.attestation_private_key (
  id smallint PRIMARY KEY CHECK(id=1),
  secret_key bytea NOT NULL CHECK(octet_length(secret_key)>=32)
);
INSERT INTO kg.attestation_private_key(id, secret_key)
VALUES (1, decode(:'attestation_secret', 'hex'));

CREATE TABLE kg.human_review_attestations (
  revision_id uuid PRIMARY KEY REFERENCES kg.approvals(revision_id),
  reviewer_staff_id bigint NOT NULL,
  revision_checksum text NOT NULL CHECK(length(revision_checksum)=64),
  nonce text NOT NULL CHECK(nonce ~ '^[a-f0-9]{32}$'),
  signature text NOT NULL CHECK(signature ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(revision_id,nonce)
);
CREATE TRIGGER immutable_human_approval_attestation
 BEFORE UPDATE OR DELETE ON kg.human_review_attestations
 FOR EACH ROW EXECUTE FUNCTION kg.no_change();

-- SECURITY DEFINER runs as the schema owner. It verifies a HMAC generated
-- by the real authenticated web application over:
-- revision UUID | JWT staff ID | immutable revision checksum | random nonce.
-- The restricted reviewer DB principal cannot read the signing key.
CREATE FUNCTION kg.approve_revision_attested(
 p_revision uuid, p_staff_id bigint, p_nonce text, p_signature text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, kg, pg_temp
AS $$
DECLARE
  v_checksum text;
  v_key bytea;
  v_expected text;
  v_message text;
BEGIN
  IF session_user <> 'kg_g1_reviewer_probe' THEN
    RAISE EXCEPTION 'NOT_REVIEWER_LOGIN' USING ERRCODE='42501';
  END IF;
  IF p_staff_id IS NULL OR p_staff_id < 1
     OR p_nonce !~ '^[a-f0-9]{32}$'
     OR p_signature !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_REVIEW_ATTESTATION' USING ERRCODE='42501';
  END IF;

  SELECT r.checksum INTO STRICT v_checksum
  FROM kg.revisions r WHERE r.id=p_revision;

  -- The staff table is created by Payload when the isolated Next.js test
  -- initializes its real authentication-enabled collection.
  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id=p_staff_id AND s.role='reviewer'
  ) THEN
    RAISE EXCEPTION 'NOT_A_VALID_REVIEWER_STAFF_ACCOUNT' USING ERRCODE='42501';
  END IF;

  SELECT k.secret_key INTO STRICT v_key FROM kg.attestation_private_key k WHERE k.id=1;
  v_message := p_revision::text || '|' || p_staff_id::text || '|' ||
    v_checksum || '|' || p_nonce;
  v_expected := encode(hmac(convert_to(v_message,'UTF8'),v_key,'sha256'),'hex');

  IF v_expected <> p_signature THEN
    RAISE EXCEPTION 'REVIEW_ATTESTATION_SIGNATURE_INVALID' USING ERRCODE='42501';
  END IF;

  PERFORM kg.approve_revision(p_revision);
  INSERT INTO kg.human_review_attestations(
    revision_id,reviewer_staff_id,revision_checksum,nonce,signature
  ) VALUES(p_revision,p_staff_id,v_checksum,p_nonce,p_signature);
END $$;

-- A reviewer service cannot bypass the HMAC requirement via the older entrypoint.
REVOKE EXECUTE ON FUNCTION kg.approve_revision(uuid) FROM kg_g1_reviewer_probe;
REVOKE ALL ON FUNCTION kg.approve_revision_attested(uuid,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kg.approve_revision_attested(uuid,bigint,text,text)
 TO kg_g1_reviewer_probe;
COMMIT;
