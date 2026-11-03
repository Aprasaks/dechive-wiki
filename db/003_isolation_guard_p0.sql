-- Fail closed for category writes under snapshot-isolation modes not covered by
-- the READ COMMITTED advisory lock + reachability recheck experiment.
BEGIN;
CREATE OR REPLACE FUNCTION kg.category_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('transaction_isolation') <> 'read committed' THEN
   RAISE EXCEPTION 'UNSUPPORTED_TAXONOMY_ISOLATION'
     USING ERRCODE='25000';
 END IF;
 PERFORM pg_advisory_xact_lock(2626,1);
 IF EXISTS (
   WITH RECURSIVE downstream(node) AS (
     SELECT NEW.child
     UNION
     SELECT edge.child FROM kg.category_edges edge
       JOIN downstream d ON edge.parent=d.node
   ) SELECT 1 FROM downstream WHERE node=NEW.parent
 ) THEN RAISE EXCEPTION 'CATEGORY_CYCLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
