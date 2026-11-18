-- Only the two dedicated service logins receive database connection access.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO kg_g1_candidate_probe,kg_g1_reviewer_probe',current_database());
END $$;
COMMIT;
