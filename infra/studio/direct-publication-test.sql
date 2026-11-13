DO $$
DECLARE e uuid := gen_random_uuid(); r record;
BEGIN
 IF EXISTS (SELECT 1 FROM kg.public_entries) THEN RAISE EXCEPTION 'unexpected public data'; END IF;
 SELECT * INTO r FROM kg.publish_studio_draft(e,'First title','First body','First summary','history');
 IF r.version<>1 OR NOT EXISTS(SELECT 1 FROM kg.public_entries p WHERE p.entity_id=e AND p.body='First body')
 OR NOT EXISTS(SELECT 1 FROM kg.public_search_verified p WHERE p.entity_id=e)
 OR NOT EXISTS(SELECT 1 FROM kg.public_revision_metadata p WHERE p.entity_id=e AND p.primary_domain='history')
 THEN RAISE EXCEPTION 'first publication missing'; END IF;
 SELECT * INTO r FROM kg.publish_studio_draft(e,'Second title','Second body','Second summary','science');
 IF r.version<>2 OR (SELECT count(*) FROM kg.studio_public_revisions WHERE entity_id=e)<>2
 OR EXISTS(SELECT 1 FROM kg.public_entries p WHERE p.entity_id=e AND p.body='First body')
 OR NOT EXISTS(SELECT 1 FROM kg.public_revision_metadata p WHERE p.entity_id=e AND p.title='Second title' AND p.primary_domain='science')
 THEN RAISE EXCEPTION 'update failed'; END IF;
END $$;
