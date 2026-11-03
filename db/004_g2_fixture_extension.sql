-- G2 mixed-type fixture extension: experimental coverage only.
BEGIN;
INSERT INTO kg.relation_types(kind,is_symmetric) VALUES
 ('edition_of',false),('has_issue',false),('contains_article',false),
 ('discusses',false),('focuses_on',false);
INSERT INTO kg.relation_rules(kind,subject_type,object_type) VALUES
 ('edition_of','edition','book_work'),
 ('has_issue','periodical','issue'),
 ('contains_article','issue','periodical_article'),
 ('discusses','event','concept'),
 ('focuses_on','research_paper','concept');
CREATE TABLE kg.relation_qualifiers (
 relation_id uuid NOT NULL REFERENCES kg.relations(id),
 qualifier_key text NOT NULL,
 qualifier_value text NOT NULL,
 PRIMARY KEY(relation_id,qualifier_key,qualifier_value)
);
COMMIT;
