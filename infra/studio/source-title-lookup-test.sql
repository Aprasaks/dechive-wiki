\set ON_ERROR_STOP on
DO $$ BEGIN
 IF has_function_privilege('kg_g1_candidate_probe','kg.studio_source_by_locator(text)','EXECUTE') THEN RAISE EXCEPTION 'public lookup access'; END IF;
END $$;
SET SESSION AUTHORIZATION kg_studio_publish;
DO $$ BEGIN
 IF (SELECT description FROM kg.studio_source_by_locator('https://example.org/solo')) <> 'Synthetic source' THEN RAISE EXCEPTION 'existing title lookup failed'; END IF;
 IF EXISTS(SELECT 1 FROM kg.studio_source_by_locator('https://example.org/other')) THEN RAISE EXCEPTION 'unexpected source match'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
