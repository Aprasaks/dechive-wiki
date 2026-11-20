\set ON_ERROR_STOP on
INSERT INTO kg.entity_types(kind) VALUES ('concept');
INSERT INTO kg.candidate_private_key(id,secret_key) VALUES(1,decode(repeat('a',64),'hex'));
INSERT INTO kg.attestation_private_key(id,secret_key) VALUES(1,decode(repeat('c',64),'hex'));
SELECT * FROM kg.publish_studio_draft('44444444-4444-4444-8444-444444444444','Synthetic solo article','A documented fact.','Summary','history');
SET SESSION AUTHORIZATION kg_g1_candidate_probe;
DO $$
DECLARE p jsonb; sig text; nonce text:=repeat('b',32); txt text; rev uuid;
BEGIN
 p:=jsonb_build_object('entityId','44444444-4444-4444-8444-444444444444','revisionId','55555555-5555-4555-8555-555555555555','reviewId',5,'reviewerId',1,'editorId','1','reviewMode','operator','snapshotHash',repeat('a',64),'title','Synthetic solo article','body','A documented fact.','reviewSnapshot',jsonb_build_object('media','[]'::jsonb),'reviewEvidence','[]'::jsonb,'reviewMedia','[]'::jsonb,'rows',jsonb_build_array(jsonb_build_object('claimKey','c1','anchor','paragraph','statement','A documented fact.','locator','https://example.org/solo','description','Synthetic source','pinpoint','Section 1','stance','supports')));
 txt:=jsonb_set(p,'{reviewMode}','"independent"')::text;
 sig:=encode(public.hmac(convert_to('studio-reviewed-stage-v1|'||encode(public.digest(convert_to(txt,'UTF8'),'sha256'),'hex')||'|'||nonce,'UTF8'),decode(repeat('a',64),'hex'),'sha256'),'hex');
 BEGIN PERFORM kg.stage_studio_reviewed_evidence(txt,nonce,sig); RAISE EXCEPTION 'same-person independent review accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 txt:=jsonb_set(p,'{editorId}','"2"')::text;
 sig:=encode(public.hmac(convert_to('studio-reviewed-stage-v1|'||encode(public.digest(convert_to(txt,'UTF8'),'sha256'),'hex')||'|'||nonce,'UTF8'),decode(repeat('a',64),'hex'),'sha256'),'hex');
 BEGIN PERFORM kg.stage_studio_reviewed_evidence(txt,nonce,sig); RAISE EXCEPTION 'mismatched operator accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 txt:=p::text; sig:=encode(public.hmac(convert_to('studio-reviewed-stage-v1|'||encode(public.digest(convert_to(txt,'UTF8'),'sha256'),'hex')||'|'||nonce,'UTF8'),decode(repeat('a',64),'hex'),'sha256'),'hex');
 BEGIN PERFORM kg.stage_studio_reviewed_evidence(txt,nonce,repeat('0',64)); RAISE EXCEPTION 'forged signature accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 rev:=kg.stage_studio_reviewed_evidence(txt,nonce,sig);
 IF rev<>'55555555-5555-4555-8555-555555555555'::uuid THEN RAISE EXCEPTION 'wrong revision'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM kg.approvals WHERE revision_id='55555555-5555-4555-8555-555555555555') THEN RAISE EXCEPTION 'staging wrongly approved review'; END IF;
 IF (SELECT payload->>'reviewMode' FROM kg.studio_reviewed_evidence_staged WHERE review_id=5)<>'operator' THEN RAISE EXCEPTION 'review mode missing'; END IF;
END $$;

SET SESSION AUTHORIZATION kg_g1_reviewer_probe;
DO $$ DECLARE dig text; nonce text:=repeat('c',32); sig text; BEGIN
 SELECT payload_digest INTO STRICT dig FROM kg.studio_reviewed_approval_context('55555555-5555-4555-8555-555555555555',1);
 sig:=encode(public.hmac(convert_to('studio-reviewed-approval-v1|55555555-5555-4555-8555-555555555555|1|'||dig||'|'||nonce,'UTF8'),decode(repeat('c',64),'hex'),'sha256'),'hex');
 BEGIN PERFORM kg.approve_studio_reviewed_evidence('55555555-5555-4555-8555-555555555555',1,nonce,repeat('0',64)); RAISE EXCEPTION 'forged approval accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM kg.approve_studio_reviewed_evidence('55555555-5555-4555-8555-555555555555',1,nonce,sig);
 IF NOT (SELECT approved FROM kg.studio_reviewed_approval_context('55555555-5555-4555-8555-555555555555',1)) THEN RAISE EXCEPTION 'approval not recorded'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF (SELECT count(*) FROM kg.public_claim_sources WHERE entity_id='44444444-4444-4444-8444-444444444444')<>1 THEN RAISE EXCEPTION 'approved evidence not public'; END IF;
END $$;
