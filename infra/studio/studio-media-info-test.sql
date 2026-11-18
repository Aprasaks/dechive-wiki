\set ON_ERROR_STOP on
DO $$ DECLARE m uuid; e uuid:=gen_random_uuid(); found text;
BEGIN
 INSERT INTO kg.studio_media(entity_id,content_type,data) VALUES(e,'image/png',decode('89504e47','hex')) RETURNING id INTO m;
 SELECT sha256 INTO found FROM kg.studio_media_info(e,m);
 IF found<>encode(public.digest(decode('89504e47','hex'),'sha256'),'hex') THEN RAISE EXCEPTION 'incorrect image digest'; END IF;
 IF EXISTS(SELECT 1 FROM kg.studio_media_info(gen_random_uuid(),m)) THEN RAISE EXCEPTION 'cross-article image exposed'; END IF;
END $$;
