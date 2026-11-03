-- P0 hardening after first DB execution: bound approvals and claim anchors.
BEGIN;
CREATE FUNCTION kg.ensure_revision_claims_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_revision uuid;
BEGIN
 target_revision:=CASE WHEN TG_OP='DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
 IF EXISTS(SELECT 1 FROM kg.approvals WHERE revision_id=target_revision)
 THEN RAISE EXCEPTION 'APPROVED_CLAIMS_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_approved_claims BEFORE INSERT OR UPDATE OR DELETE ON kg.claims
 FOR EACH ROW EXECUTE FUNCTION kg.ensure_revision_claims_immutable();
CREATE TRIGGER immutable_approved_evidence BEFORE INSERT OR UPDATE OR DELETE ON kg.claim_evidence
 FOR EACH ROW EXECUTE FUNCTION kg.ensure_revision_claims_immutable();
CREATE TRIGGER immutable_approved_media_links BEFORE INSERT OR UPDATE OR DELETE ON kg.revision_media
 FOR EACH ROW EXECUTE FUNCTION kg.ensure_revision_claims_immutable();
CREATE TRIGGER immutable_approvals BEFORE UPDATE OR DELETE ON kg.approvals
 FOR EACH ROW EXECUTE FUNCTION kg.no_change();
CREATE TRIGGER immutable_sources BEFORE UPDATE OR DELETE ON kg.sources
 FOR EACH ROW EXECUTE FUNCTION kg.no_change();

CREATE FUNCTION kg.check_approval_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE body_value text;
BEGIN
 SELECT body INTO STRICT body_value FROM kg.revisions WHERE id=NEW.revision_id;
 IF NOT EXISTS(SELECT 1 FROM kg.claims WHERE revision_id=NEW.revision_id) THEN
   RAISE EXCEPTION 'APPROVAL_REQUIRES_CLAIMS' USING ERRCODE='23514'; END IF;
 IF EXISTS(
   SELECT 1 FROM kg.claims c WHERE c.revision_id=NEW.revision_id
   AND (
     position(c.statement IN body_value)=0
     OR NOT EXISTS (SELECT 1 FROM kg.claim_evidence ev
       WHERE ev.revision_id=c.revision_id AND ev.claim_key=c.claim_key
       AND ev.stance='supports')
   )
 ) THEN RAISE EXCEPTION 'APPROVAL_REQUIRES_REVISION_BOUND_EVIDENCE' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approval_guard BEFORE INSERT ON kg.approvals
 FOR EACH ROW EXECUTE FUNCTION kg.check_approval_integrity();
COMMIT;
