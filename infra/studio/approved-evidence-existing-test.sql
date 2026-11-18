-- Fixture: a published studio revision already has a matching approved core revision.
\set ON_ERROR_STOP on
SELECT * FROM kg.publish_studio_draft('11111111-1111-4111-8111-111111111111','Existing','Existing fact.','Summary','science');
INSERT INTO kg.entities(id,kind,name) VALUES('11111111-1111-4111-8111-111111111111','concept','Existing');
INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','en','Existing fact.');
INSERT INTO kg.sources(id,locator,description) VALUES('33333333-3333-4333-8333-333333333333','https://example.org/existing','Existing source');
INSERT INTO kg.claims(revision_id,claim_key,anchor,statement) VALUES('22222222-2222-4222-8222-222222222222','c1','paragraph 1','Existing fact.');
INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) VALUES('22222222-2222-4222-8222-222222222222','c1','33333333-3333-4333-8333-333333333333','supports','Section 1','reviewer');
INSERT INTO kg.revision_reader_metadata(revision_id,title,summary,primary_domain) VALUES('22222222-2222-4222-8222-222222222222','Existing','Summary','science');
INSERT INTO kg.approvals(revision_id,reviewer) VALUES('22222222-2222-4222-8222-222222222222','reviewer');
