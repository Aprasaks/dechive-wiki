-- Private image metadata only, restricted to an editor's current draft identity.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION kg.studio_media_info(p_entity uuid,p_media uuid)
 RETURNS TABLE(sha256 text, content_type text)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
 SELECT encode(public.digest(m.data,'sha256'),'hex'),m.content_type
 FROM kg.studio_media m WHERE m.entity_id=p_entity AND m.id=p_media
$$;
REVOKE ALL ON FUNCTION kg.studio_media_info(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kg.studio_media_info(uuid,uuid) TO kg_studio_publish;
COMMIT;
