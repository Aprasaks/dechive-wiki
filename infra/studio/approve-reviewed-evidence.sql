-- Separate reviewer approval of the entire previously staged evidence snapshot.
-- The private reviewer service signs revision, reviewer and complete payload hash.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE kg.studio_reviewed_approval_attestations (
 revision_id uuid PRIMARY KEY REFERENCES kg.studio_reviewed_evidence_staged(revision_id),
 reviewer_id bigint NOT NULL CHECK(reviewer_id>0),
 payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
 nonce text NOT NULL CHECK(nonce ~ '^[a-f0-9]{32}$'),
 signature text NOT NULL CHECK(signature ~ '^[a-f0-9]{64}$'),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER studio_reviewed_approval_immutable BEFORE UPDATE OR DELETE ON kg.studio_reviewed_approval_attestations
 FOR EACH ROW EXECUTE FUNCTION kg.no_change();
REVOKE ALL ON kg.studio_reviewed_approval_attestations FROM PUBLIC,kg_public_http,kg_g1_candidate_probe,kg_g1_reviewer_probe;

CREATE OR REPLACE FUNCTION kg.block_unapproved_studio_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM kg.studio_reviewed_evidence_staged WHERE revision_id=NEW.revision_id)
 AND NOT EXISTS(SELECT 1 FROM kg.studio_reviewed_approval_attestations a
 JOIN kg.studio_reviewed_evidence_staged s USING(revision_id)
 WHERE a.revision_id=NEW.revision_id AND a.reviewer_id=s.reviewer_id AND a.payload_digest=s.payload_digest)
 THEN RAISE EXCEPTION 'SIGNED_STUDIO_EVIDENCE_APPROVAL_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION kg.studio_reviewed_approval_context(p_revision uuid,p_reviewer bigint)
RETURNS TABLE(payload jsonb,payload_digest text,approved boolean) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
 SELECT s.payload,s.payload_digest,EXISTS(SELECT 1 FROM kg.approvals a WHERE a.revision_id=s.revision_id) FROM kg.studio_reviewed_evidence_staged s
 WHERE session_user='kg_g1_reviewer_probe' AND s.revision_id=p_revision AND s.reviewer_id=p_reviewer

$$;

CREATE FUNCTION kg.approve_studio_reviewed_evidence(p_revision uuid,p_reviewer bigint,p_nonce text,p_signature text)
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
 IF NOT EXISTS(SELECT 1 FROM kg.studio_public_heads h JOIN kg.studio_public_revisions s
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
REVOKE ALL ON FUNCTION kg.studio_reviewed_approval_context(uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION kg.approve_studio_reviewed_evidence(uuid,bigint,text,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA kg TO kg_g1_reviewer_probe;
GRANT EXECUTE ON FUNCTION kg.studio_reviewed_approval_context(uuid,bigint) TO kg_g1_reviewer_probe;
GRANT EXECUTE ON FUNCTION kg.approve_studio_reviewed_evidence(uuid,bigint,text,text) TO kg_g1_reviewer_probe;
COMMIT;
