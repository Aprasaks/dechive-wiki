\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (SELECT count(*) FROM kg.public_claim_sources WHERE entity_id='11111111-1111-4111-8111-111111111111')<>1 THEN RAISE EXCEPTION 'existing evidence not linked'; END IF;
END $$;
DO $$
DECLARE e uuid:=gen_random_uuid(); studio uuid; approved uuid:=gen_random_uuid(); unapproved uuid:=gen_random_uuid(); src uuid:=gen_random_uuid(); newer uuid;
BEGIN
 SELECT revision_id INTO studio FROM kg.publish_studio_draft(e,'Test','A fact.','Summary','science');
 INSERT INTO kg.entities(id,kind,name) VALUES(e,'concept','Test');
 INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES(approved,e,'en','A fact.'),(unapproved,e,'en','Another fact.');
 INSERT INTO kg.sources(id,locator,description) VALUES(src,'https://example.org/source','Example source');
 INSERT INTO kg.claims(revision_id,claim_key,anchor,statement) VALUES(approved,'c1','paragraph 1','A fact.');
 INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) VALUES(approved,'c1',src,'supports','Section 1','reviewer');
 BEGIN PERFORM kg.link_studio_approved_evidence(studio,approved); RAISE EXCEPTION 'unapproved allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO kg.revision_reader_metadata(revision_id,title,summary,primary_domain) VALUES(approved,'Test','Summary','science');
 INSERT INTO kg.approvals(revision_id,reviewer) VALUES(approved,'reviewer');
 BEGIN PERFORM kg.link_studio_approved_evidence(studio,unapproved); RAISE EXCEPTION 'mismatch allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT count(*) FROM kg.public_claim_sources WHERE revision_id=studio)<>1 THEN RAISE EXCEPTION 'missing evidence'; END IF;
 BEGIN DELETE FROM kg.studio_approved_evidence_links WHERE studio_revision_id=studio; RAISE EXCEPTION 'delete allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO kg.studio_public_revisions(entity_id,version,title,body,summary,primary_domain) VALUES(e,2,'Test','Changed.','Summary','science') RETURNING revision_id INTO newer;
 UPDATE kg.studio_public_heads SET revision_id=newer,version=2 WHERE entity_id=e;
 IF EXISTS(SELECT 1 FROM kg.public_claim_sources WHERE entity_id=e) THEN RAISE EXCEPTION 'old evidence leaked'; END IF;
END $$;
