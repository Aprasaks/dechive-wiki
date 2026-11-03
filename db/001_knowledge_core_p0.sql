-- DECHIVE.WIKI P0 EXPERIMENT ONLY. Never run against production.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA kg;

CREATE TABLE kg.entity_types(kind text PRIMARY KEY);
INSERT INTO kg.entity_types VALUES
 ('concept'),('person'),('research_paper'),('book_work'),('edition'),
 ('periodical'),('issue'),('periodical_article'),('event'),('place'),('organization');
CREATE TABLE kg.entities(
 id uuid PRIMARY KEY, kind text NOT NULL REFERENCES kg.entity_types(kind),
 name text NOT NULL CHECK(btrim(name)<>'')
);
CREATE TABLE kg.categories(id uuid PRIMARY KEY, code text NOT NULL UNIQUE, label_en text NOT NULL);
CREATE TABLE kg.category_edges(
 parent uuid NOT NULL REFERENCES kg.categories(id),
 child uuid NOT NULL REFERENCES kg.categories(id),
 PRIMARY KEY(parent,child), CHECK(parent<>child)
);
CREATE FUNCTION kg.category_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(2626,1);
 IF EXISTS (
   WITH RECURSIVE downstream(node) AS (
     SELECT NEW.child
     UNION SELECT edge.child FROM kg.category_edges edge
       JOIN downstream d ON edge.parent=d.node
   ) SELECT 1 FROM downstream WHERE node=NEW.parent
 ) THEN RAISE EXCEPTION 'CATEGORY_CYCLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER category_guard BEFORE INSERT OR UPDATE ON kg.category_edges
 FOR EACH ROW EXECUTE FUNCTION kg.category_guard();

CREATE TABLE kg.relation_types(kind text PRIMARY KEY,is_symmetric boolean NOT NULL);
INSERT INTO kg.relation_types VALUES
 ('related_to',true),('authored',false),('developed_by',false),('cites',false),('published_as',false);
CREATE TABLE kg.relation_rules(
 kind text NOT NULL REFERENCES kg.relation_types(kind),
 subject_type text NOT NULL REFERENCES kg.entity_types(kind),
 object_type text NOT NULL REFERENCES kg.entity_types(kind),
 PRIMARY KEY(kind,subject_type,object_type)
);
INSERT INTO kg.relation_rules VALUES
 ('related_to','concept','concept'),('authored','person','research_paper'),
 ('authored','person','book_work'),('developed_by','concept','person'),
 ('cites','research_paper','research_paper'),('published_as','research_paper','periodical_article');
CREATE TABLE kg.relations(
 id uuid PRIMARY KEY,kind text NOT NULL REFERENCES kg.relation_types(kind),
 subject uuid NOT NULL REFERENCES kg.entities(id),object uuid NOT NULL REFERENCES kg.entities(id),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','rejected')),
 UNIQUE(kind,subject,object),CHECK(subject<>object)
);
CREATE FUNCTION kg.relation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sym boolean; st text; ot text; old_subject uuid;
BEGIN
 SELECT rt.is_symmetric INTO STRICT sym FROM kg.relation_types rt WHERE rt.kind=NEW.kind;
 SELECT e.kind INTO STRICT st FROM kg.entities e WHERE e.id=NEW.subject;
 SELECT e.kind INTO STRICT ot FROM kg.entities e WHERE e.id=NEW.object;
 IF NOT EXISTS(SELECT 1 FROM kg.relation_rules r
   WHERE r.kind=NEW.kind AND r.subject_type=st AND r.object_type=ot)
 THEN RAISE EXCEPTION 'INVALID_RELATION_DOMAIN_RANGE' USING ERRCODE='23514'; END IF;
 IF sym AND NEW.subject>NEW.object THEN
   old_subject:=NEW.subject;NEW.subject:=NEW.object;NEW.object:=old_subject;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER relation_guard BEFORE INSERT OR UPDATE ON kg.relations
 FOR EACH ROW EXECUTE FUNCTION kg.relation_guard();

CREATE TABLE kg.sources(
 id uuid PRIMARY KEY,locator text NOT NULL UNIQUE,description text NOT NULL,
 accessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kg.relation_evidence(
 relation_id uuid NOT NULL REFERENCES kg.relations(id),
 source_id uuid NOT NULL REFERENCES kg.sources(id),
 stance text NOT NULL CHECK(stance IN ('supports','contradicts','uncertain')),
 pinpoint text NOT NULL CHECK(btrim(pinpoint)<>''), reviewer text NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(relation_id,source_id,stance,pinpoint)
);
CREATE TABLE kg.revisions(
 id uuid PRIMARY KEY,
 entity_id uuid NOT NULL REFERENCES kg.entities(id),
 locale text NOT NULL CHECK(locale='en'),
 body text NOT NULL CHECK(length(body)>0),
 checksum text GENERATED ALWAYS AS (encode(digest(body,'sha256'),'hex')) STORED,
 UNIQUE(id,entity_id,locale)
);
CREATE FUNCTION kg.no_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_REVISION_OR_SNAPSHOT' USING ERRCODE='23514'; END $$;
CREATE TRIGGER no_revision_changes BEFORE UPDATE OR DELETE ON kg.revisions
 FOR EACH ROW EXECUTE FUNCTION kg.no_change();
CREATE TABLE kg.claims(
 revision_id uuid NOT NULL REFERENCES kg.revisions(id),
 claim_key text NOT NULL,anchor text NOT NULL,statement text NOT NULL,
 PRIMARY KEY(revision_id,claim_key)
);
CREATE TABLE kg.claim_evidence(
 revision_id uuid NOT NULL, claim_key text NOT NULL,
 source_id uuid NOT NULL REFERENCES kg.sources(id),
 stance text NOT NULL CHECK(stance IN ('supports','contradicts','uncertain')),
 pinpoint text NOT NULL,reviewer text NOT NULL,checked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(revision_id,claim_key,source_id,stance,pinpoint),
 FOREIGN KEY(revision_id,claim_key) REFERENCES kg.claims(revision_id,claim_key)
);
CREATE TABLE kg.approvals(revision_id uuid PRIMARY KEY REFERENCES kg.revisions(id),reviewer text NOT NULL);
CREATE TABLE kg.media(
 id uuid PRIMARY KEY,object_key text NOT NULL UNIQUE,checksum text NOT NULL,
 rights_status text NOT NULL CHECK(rights_status IN ('unknown','approved','restricted','takedown')),
 public_use boolean NOT NULL DEFAULT false
);
CREATE TABLE kg.revision_media(
 revision_id uuid NOT NULL REFERENCES kg.revisions(id),asset_id uuid NOT NULL REFERENCES kg.media(id),
 PRIMARY KEY(revision_id,asset_id)
);
CREATE TABLE kg.snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entity_id uuid NOT NULL REFERENCES kg.entities(id),
 locale text NOT NULL CHECK(locale='en'),
 revision_id uuid NOT NULL UNIQUE REFERENCES kg.revisions(id),
 checksum text NOT NULL
);
CREATE TRIGGER no_snapshot_changes BEFORE UPDATE OR DELETE ON kg.snapshots
 FOR EACH ROW EXECUTE FUNCTION kg.no_change();
CREATE TABLE kg.heads(
 entity_id uuid NOT NULL REFERENCES kg.entities(id),
 locale text NOT NULL CHECK(locale='en'),
 version bigint NOT NULL CHECK(version>0),
 snapshot_id uuid REFERENCES kg.snapshots(id),
 PRIMARY KEY(entity_id,locale)
);
CREATE TABLE kg.outbox(
 id bigserial PRIMARY KEY,entity_id uuid NOT NULL,locale text NOT NULL,
 version bigint NOT NULL,snapshot_id uuid,processed boolean NOT NULL DEFAULT false,
 UNIQUE(entity_id,locale,version)
);
CREATE TABLE kg.search_projection(
 entity_id uuid NOT NULL,locale text NOT NULL,version bigint NOT NULL,
 revision_id uuid NOT NULL,body text NOT NULL,PRIMARY KEY(entity_id,locale)
);
CREATE VIEW kg.public_entries AS
 SELECT h.entity_id,h.locale,h.version,r.id revision_id,r.body,r.checksum
 FROM kg.heads h JOIN kg.snapshots s ON h.snapshot_id=s.id
 JOIN kg.revisions r ON r.id=s.revision_id WHERE s.checksum=r.checksum;
-- A live rights check is needed even if an old approved snapshot remains public.
CREATE VIEW kg.public_media AS
 SELECT DISTINCT m.id,m.object_key FROM kg.media m
 JOIN kg.revision_media rm ON rm.asset_id=m.id
 JOIN kg.snapshots s ON s.revision_id=rm.revision_id
 JOIN kg.heads h ON h.snapshot_id=s.id
 WHERE m.rights_status='approved' AND m.public_use;

CREATE FUNCTION kg.publish(p_entity uuid,p_revision uuid,p_expected bigint)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE rev kg.revisions%ROWTYPE; current_version bigint; new_snapshot uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_entity::text || ':en',0));
 SELECT * INTO rev FROM kg.revisions WHERE id=p_revision AND entity_id=p_entity AND locale='en';
 IF NOT FOUND THEN RAISE EXCEPTION 'REVISION_NOT_FOUND' USING ERRCODE='23514'; END IF;
 SELECT version INTO current_version FROM kg.heads WHERE entity_id=p_entity AND locale='en';
 IF coalesce(current_version,0)<>p_expected THEN
   RAISE EXCEPTION 'STALE_PUBLIC_HEAD' USING ERRCODE='40001';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM kg.approvals WHERE revision_id=p_revision) THEN
   RAISE EXCEPTION 'NOT_APPROVED' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM kg.claims WHERE revision_id=p_revision) THEN
   RAISE EXCEPTION 'NO_CLAIMS' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM kg.claims c WHERE c.revision_id=p_revision AND
   NOT EXISTS(SELECT 1 FROM kg.claim_evidence ev WHERE ev.revision_id=c.revision_id
     AND ev.claim_key=c.claim_key AND ev.stance='supports')) THEN
   RAISE EXCEPTION 'CLAIM_WITHOUT_EVIDENCE' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM kg.revision_media rm JOIN kg.media m ON rm.asset_id=m.id
   WHERE rm.revision_id=p_revision AND (m.rights_status<>'approved' OR NOT m.public_use)) THEN
   RAISE EXCEPTION 'RIGHTS_BLOCKED' USING ERRCODE='23514';END IF;
 INSERT INTO kg.snapshots(entity_id,locale,revision_id,checksum)
 VALUES(p_entity,'en',p_revision,rev.checksum) RETURNING id INTO new_snapshot;
 INSERT INTO kg.heads(entity_id,locale,version,snapshot_id)
 VALUES(p_entity,'en',p_expected+1,new_snapshot)
 ON CONFLICT(entity_id,locale) DO UPDATE SET version=excluded.version,snapshot_id=excluded.snapshot_id;
 INSERT INTO kg.outbox(entity_id,locale,version,snapshot_id)
 VALUES(p_entity,'en',p_expected+1,new_snapshot);
 RETURN p_expected+1;
END $$;
CREATE FUNCTION kg.project_event(p_id bigint) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE ev kg.outbox%ROWTYPE; h kg.heads%ROWTYPE; rev kg.revisions%ROWTYPE;
BEGIN
 SELECT * INTO STRICT ev FROM kg.outbox WHERE id=p_id FOR UPDATE;
 SELECT * INTO STRICT h FROM kg.heads WHERE entity_id=ev.entity_id AND locale=ev.locale;
 IF h.version<>ev.version OR h.snapshot_id IS DISTINCT FROM ev.snapshot_id THEN
   UPDATE kg.outbox SET processed=true WHERE id=p_id;RETURN false;
 END IF;
 IF h.snapshot_id IS NULL THEN
   DELETE FROM kg.search_projection WHERE entity_id=h.entity_id AND locale=h.locale;
 ELSE
   SELECT r.* INTO STRICT rev FROM kg.snapshots s
     JOIN kg.revisions r ON r.id=s.revision_id WHERE s.id=h.snapshot_id;
   INSERT INTO kg.search_projection(entity_id,locale,version,revision_id,body)
   VALUES(h.entity_id,h.locale,h.version,rev.id,rev.body)
   ON CONFLICT(entity_id,locale) DO UPDATE
   SET version=excluded.version,revision_id=excluded.revision_id,body=excluded.body
   WHERE kg.search_projection.version<=excluded.version;
 END IF;
 UPDATE kg.outbox SET processed=true WHERE id=p_id;RETURN true;
END $$;
COMMIT;
