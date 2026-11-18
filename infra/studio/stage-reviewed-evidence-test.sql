\set ON_ERROR_STOP on
SELECT * FROM kg.publish_studio_draft('44444444-4444-4444-8444-444444444444','Stage','A staged fact.','Summary','science');
SET SESSION AUTHORIZATION kg_g1_candidate_probe;
DO $$
DECLARE p text; nonce text:=repeat('b',32); sig text; r uuid;
BEGIN
 p:=jsonb_build_object('entityId','44444444-4444-4444-8444-444444444444','revisionId','55555555-5555-4555-8555-555555555555','reviewId',5,'reviewerId',2,'editorId','1','snapshotHash',repeat('a',64),'title','Stage','body','A staged fact.','reviewSnapshot','{}'::jsonb,'reviewEvidence','[]'::jsonb,'reviewMedia','[]'::jsonb,'rows',jsonb_build_array(jsonb_build_object('claimKey','c1','anchor','paragraph','statement','A staged fact.','locator','https://example.org/staged','description','Source','pinpoint','Section 1','stance','supports')))::text;
 sig:=encode(public.hmac(convert_to('studio-reviewed-stage-v1|'||encode(public.digest(convert_to(p,'UTF8'),'sha256'),'hex')||'|'||nonce,'UTF8'),decode(repeat('a',64),'hex'),'sha256'),'hex');
 BEGIN PERFORM kg.stage_studio_reviewed_evidence(p,nonce,repeat('0',64)); RAISE EXCEPTION 'invalid signature accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=kg.stage_studio_reviewed_evidence(p,nonce,sig);
 IF r<>'55555555-5555-4555-8555-555555555555'::uuid THEN RAISE EXCEPTION 'incorrect stage revision'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 BEGIN DELETE FROM kg.claim_evidence WHERE revision_id='55555555-5555-4555-8555-555555555555'; RAISE EXCEPTION 'staged evidence was mutable'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM kg.approvals WHERE revision_id='55555555-5555-4555-8555-555555555555') THEN RAISE EXCEPTION 'staged revision approved'; END IF;
 BEGIN INSERT INTO kg.approvals(revision_id,reviewer) VALUES('55555555-5555-4555-8555-555555555555','reviewer'); RAISE EXCEPTION 'unsafe approval allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET SESSION AUTHORIZATION kg_g1_reviewer_probe;
DO $$ DECLARE dig text; nonce text:=repeat('c',32); sig text;
BEGIN
 SELECT payload_digest INTO STRICT dig FROM kg.studio_reviewed_approval_context('55555555-5555-4555-8555-555555555555',2);
 sig:=encode(public.hmac(convert_to('studio-reviewed-approval-v1|55555555-5555-4555-8555-555555555555|2|'||dig||'|'||nonce,'UTF8'),decode(repeat('c',64),'hex'),'sha256'),'hex');
 BEGIN PERFORM kg.approve_studio_reviewed_evidence('55555555-5555-4555-8555-555555555555',2,nonce,repeat('0',64)); RAISE EXCEPTION 'forged approval accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM kg.approve_studio_reviewed_evidence('55555555-5555-4555-8555-555555555555',2,nonce,sig);
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF (SELECT count(*) FROM kg.public_claim_sources WHERE entity_id='44444444-4444-4444-8444-444444444444')<>1 THEN RAISE EXCEPTION 'approved evidence not public'; END IF;
END $$;
DO $$ DECLARE v record; BEGIN
 SELECT * INTO v FROM kg.publish_studio_draft('44444444-4444-4444-8444-444444444444','Stage updated','Updated body.','Summary','science');
 IF v.version<>2 THEN RAISE EXCEPTION 'staged evidence blocks future publication'; END IF;
END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM kg.public_claim_sources WHERE entity_id='44444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'previous evidence leaked after edit'; END IF; END $$;
