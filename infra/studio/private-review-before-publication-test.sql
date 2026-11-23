-- Regression: a signed review must be stageable before a public head exists.
\set ON_ERROR_STOP on
SET SESSION AUTHORIZATION kg_g1_candidate_probe;
DO $$
DECLARE p text; nonce text:=repeat('b',32); sig text; r uuid;
BEGIN
 p:=jsonb_build_object('entityId','a4444444-4444-4444-8444-444444444444','revisionId','a5555555-5555-4555-8555-555555555555','reviewId',501,'reviewerId',2,'editorId','1','snapshotHash',repeat('a',64),'title','Private stage','body','A verified fact.','reviewSnapshot',jsonb_build_object('media','[]'::jsonb),'reviewEvidence','[]'::jsonb,'reviewMedia','[]'::jsonb,'rows',jsonb_build_array(jsonb_build_object('claimKey','c1','anchor','paragraph','statement','A verified fact.','locator','https://example.org/private-stage','description','Source','pinpoint','Section 1','stance','supports')))::text;
 sig:=encode(public.hmac(convert_to('studio-reviewed-stage-v1|'||encode(public.digest(convert_to(p,'UTF8'),'sha256'),'hex')||'|'||nonce,'UTF8'),decode(repeat('a',64),'hex'),'sha256'),'hex');
 r:=kg.stage_studio_reviewed_evidence(p,nonce,sig);
 IF r<>'a5555555-5555-4555-8555-555555555555'::uuid THEN RAISE EXCEPTION 'incorrect private stage revision'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM kg.public_entries WHERE entity_id='a4444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'private stage leaked into public entries'; END IF;
END $$;
SET SESSION AUTHORIZATION kg_g1_reviewer_probe;
DO $$ DECLARE dig text; nonce text:=repeat('c',32); sig text;
BEGIN
 SELECT payload_digest INTO STRICT dig FROM kg.studio_reviewed_approval_context('a5555555-5555-4555-8555-555555555555',2);
 sig:=encode(public.hmac(convert_to('studio-reviewed-approval-v1|a5555555-5555-4555-8555-555555555555|2|'||dig||'|'||nonce,'UTF8'),decode(repeat('c',64),'hex'),'sha256'),'hex');
 PERFORM kg.approve_studio_reviewed_evidence('a5555555-5555-4555-8555-555555555555',2,nonce,sig);
 IF NOT (SELECT approved FROM kg.studio_reviewed_approval_context('a5555555-5555-4555-8555-555555555555',2)) THEN RAISE EXCEPTION 'private approval missing'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM kg.public_entries WHERE entity_id='a4444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'private approval leaked into public entries'; END IF;
END $$;
SET SESSION AUTHORIZATION kg_studio_publish;
DO $$ DECLARE result record;
BEGIN
 BEGIN
  PERFORM kg.publish_reviewed_studio_draft('a4444444-4444-4444-8444-444444444444','Private stage','Changed fact.','Summary','science',repeat('a',64),1);
  RAISE EXCEPTION 'changed content was accepted';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'CURRENT_REVIEW_REQUIRED' THEN RAISE; END IF; END;
 BEGIN
  PERFORM kg.publish_reviewed_studio_draft('a4444444-4444-4444-8444-444444444444','Private stage','A verified fact.','Summary','science',repeat('b',64),1);
  RAISE EXCEPTION 'changed package was accepted';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'CURRENT_REVIEW_REQUIRED' THEN RAISE; END IF; END;
 SELECT * INTO result FROM kg.publish_reviewed_studio_draft('a4444444-4444-4444-8444-444444444444','Private stage','A verified fact.','Summary','science',repeat('a',64),1);
 IF result.version<>1 THEN RAISE EXCEPTION 'approved article not published'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM kg.public_entries WHERE entity_id='a4444444-4444-4444-8444-444444444444' AND body='A verified fact.') THEN RAISE EXCEPTION 'published article missing'; END IF;
 IF (SELECT count(*) FROM kg.public_claim_sources WHERE entity_id='a4444444-4444-4444-8444-444444444444')<>1 THEN RAISE EXCEPTION 'approved sources missing'; END IF;
END $$;
