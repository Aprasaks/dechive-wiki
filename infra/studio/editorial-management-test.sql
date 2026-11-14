DO $$
DECLARE e uuid := gen_random_uuid(); r record;
BEGIN
 SELECT * INTO r FROM kg.publish_studio_draft(e,'A','First','Summary','history');
 IF NOT EXISTS(SELECT 1 FROM kg.studio_public_state(e)) THEN RAISE EXCEPTION 'status missing'; END IF;
 IF NOT kg.unpublish_studio_draft(e) THEN RAISE EXCEPTION 'unpublish failed'; END IF;
 IF EXISTS(SELECT 1 FROM kg.public_entries WHERE entity_id=e) OR EXISTS(SELECT 1 FROM kg.public_search_verified WHERE entity_id=e) THEN RAISE EXCEPTION 'still public'; END IF;
 SELECT * INTO r FROM kg.publish_studio_draft(e,'A','Updated','Summary','history');
 IF r.version<>2 OR NOT EXISTS(SELECT 1 FROM kg.public_entries WHERE entity_id=e AND body='Updated') THEN RAISE EXCEPTION 'republish failed'; END IF;
END $$;
