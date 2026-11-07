-- Disposable synthetic CI experiment only. This is not a production migration.
-- No app role can write this table and snapshots cannot authorize publication.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE kg.multi_source_snapshots (
 revision_id uuid PRIMARY KEY REFERENCES kg.revisions(id),
 review_record_id text NOT NULL CHECK(length(review_record_id) BETWEEN 1 AND 100),
 package_digest text NOT NULL CHECK(package_digest ~ '^[0-9a-f]{64}$'),
 package_data jsonb NOT NULL CHECK(jsonb_typeof(package_data)='object'),
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(package_digest=encode(public.digest(convert_to(package_data::text,'UTF8'),'sha256'),'hex'))
);
CREATE FUNCTION kg.guard_multi_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_body text; source jsonb; claim jsonb; source_id text;
        source_ids text[] := ARRAY[]::text[]; claim_ids text[] := ARRAY[]::text[];
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.revision_id::text,7007));
 SELECT body INTO STRICT revision_body FROM kg.revisions WHERE id=NEW.revision_id;
 IF EXISTS(SELECT 1 FROM kg.approvals WHERE revision_id=NEW.revision_id)
    OR NEW.package_data->>'body' IS DISTINCT FROM revision_body
    OR jsonb_typeof(NEW.package_data->'sources') IS DISTINCT FROM 'array'
    OR jsonb_array_length(NEW.package_data->'sources') < 2
    OR jsonb_typeof(NEW.package_data->'claims') IS DISTINCT FROM 'array'
    OR jsonb_typeof(NEW.package_data->'media') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'INVALID_MULTI_SOURCE_SNAPSHOT' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(NEW.package_data->'claims')=0 THEN
  RAISE EXCEPTION 'SNAPSHOT_REQUIRES_CLAIMS' USING ERRCODE='23514'; END IF;
 FOR source IN SELECT value FROM jsonb_array_elements(NEW.package_data->'sources') LOOP
  source_id := source->>'id';
  IF source_id IS NULL OR source_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     OR source_id=ANY(source_ids) OR coalesce(source->>'url','') !~ '^https://[^[:space:]]+$'
     OR length(btrim(coalesce(source->>'description','')))=0 THEN
   RAISE EXCEPTION 'INVALID_SNAPSHOT_SOURCE' USING ERRCODE='23514'; END IF;
  source_ids := array_append(source_ids,source_id);
 END LOOP;
 FOR claim IN SELECT value FROM jsonb_array_elements(NEW.package_data->'claims') LOOP
  IF coalesce(claim->>'id','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     OR (claim->>'id')=ANY(claim_ids)
     OR length(btrim(coalesce(claim->>'statement','')))=0
     OR position(claim->>'statement' IN revision_body)=0
     OR length(btrim(coalesce(claim->>'anchor','')))=0
     OR jsonb_typeof(claim->'sourceIds') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'INVALID_SNAPSHOT_CLAIM' USING ERRCODE='23514'; END IF;
  claim_ids := array_append(claim_ids,claim->>'id');
  IF jsonb_array_length(claim->'sourceIds')=0 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements_text(claim->'sourceIds') AS ref(id)
   WHERE NOT (ref.id=ANY(source_ids))) OR
   (SELECT count(*)<>count(DISTINCT ref.id) FROM jsonb_array_elements_text(claim->'sourceIds') AS ref(id)) THEN
   RAISE EXCEPTION 'INVALID_SNAPSHOT_CLAIM_SOURCES' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER multi_snapshot_guard BEFORE INSERT ON kg.multi_source_snapshots
 FOR EACH ROW EXECUTE FUNCTION kg.guard_multi_snapshot();
CREATE TRIGGER multi_snapshot_immutable BEFORE UPDATE OR DELETE ON kg.multi_source_snapshots
 FOR EACH ROW EXECUTE FUNCTION kg.no_change();
CREATE FUNCTION kg.block_multi_source_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.revision_id::text,7007));
 IF EXISTS(SELECT 1 FROM kg.multi_source_snapshots WHERE revision_id=NEW.revision_id)
 THEN RAISE EXCEPTION 'MULTI_SOURCE_APPROVAL_NOT_IMPLEMENTED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER multi_source_approval_block BEFORE INSERT ON kg.approvals
 FOR EACH ROW EXECUTE FUNCTION kg.block_multi_source_approval();
REVOKE ALL ON kg.multi_source_snapshots FROM PUBLIC,kg_public_http,kg_g1_candidate_probe,kg_g1_reviewer_probe;
COMMIT;
