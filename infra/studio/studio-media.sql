BEGIN;
CREATE TABLE IF NOT EXISTS kg.studio_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entity_id uuid NOT NULL,
 content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
 data bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 2097152),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON kg.studio_media FROM PUBLIC;
CREATE OR REPLACE FUNCTION kg.store_studio_media(p_entity uuid,p_type text,p_data bytea)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg AS $$
DECLARE media_id uuid;
BEGIN
 IF p_entity IS NULL OR p_type NOT IN ('image/png','image/jpeg','image/webp') OR octet_length(p_data) NOT BETWEEN 1 AND 2097152 THEN RAISE EXCEPTION 'INVALID_IMAGE'; END IF;
 INSERT INTO kg.studio_media(entity_id,content_type,data) VALUES(p_entity,p_type,p_data) RETURNING id INTO media_id;
 RETURN media_id;
END $$;
CREATE OR REPLACE FUNCTION kg.read_public_studio_media(p_id uuid)
 RETURNS TABLE(content_type text,data bytea) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,kg AS $$
 SELECT m.content_type,m.data FROM kg.studio_media m
 JOIN kg.studio_public_heads h ON h.entity_id=m.entity_id
 JOIN kg.studio_public_revisions r ON (h.entity_id,h.revision_id,h.version)=(r.entity_id,r.revision_id,r.version)
 WHERE m.id=p_id AND position('](/media/'||m.id::text||')' in r.body)>0
$$;
REVOKE ALL ON FUNCTION kg.store_studio_media(uuid,text,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION kg.read_public_studio_media(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kg.store_studio_media(uuid,text,bytea) TO kg_studio_publish;
GRANT EXECUTE ON FUNCTION kg.read_public_studio_media(uuid) TO kg_public_http;
COMMIT;
