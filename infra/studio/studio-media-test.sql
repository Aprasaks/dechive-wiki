DO $$
DECLARE e uuid:=gen_random_uuid(); other_e uuid:=gen_random_uuid(); m uuid; other_m uuid; r record;
BEGIN
 m:=kg.store_studio_media(e,'image/png',decode('89504e470d0a1a0a','hex'));
 other_m:=kg.store_studio_media(other_e,'image/png',decode('89504e470d0a1a0a','hex'));
 IF EXISTS(SELECT 1 FROM kg.read_public_studio_media(m)) THEN RAISE EXCEPTION 'private media exposed'; END IF;
 SELECT * INTO r FROM kg.publish_studio_draft(e,'Image test','![alt](/media/'||m::text||') ![other](/media/'||other_m::text||')','Test','history');
 IF NOT EXISTS(SELECT 1 FROM kg.read_public_studio_media(m)) THEN RAISE EXCEPTION 'published media missing'; END IF;
 IF EXISTS(SELECT 1 FROM kg.read_public_studio_media(other_m)) THEN RAISE EXCEPTION 'cross-article media exposed'; END IF;
 PERFORM kg.unpublish_studio_draft(e);
 IF EXISTS(SELECT 1 FROM kg.read_public_studio_media(m)) THEN RAISE EXCEPTION 'unpublished media exposed'; END IF;
END $$;
