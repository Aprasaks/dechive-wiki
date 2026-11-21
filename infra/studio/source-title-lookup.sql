-- Exact URL lookup for authenticated editors; no source is modified.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION kg.studio_source_by_locator(p_locator text)
RETURNS TABLE(description text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
 SELECT s.description FROM kg.sources AS s WHERE s.locator=p_locator AND length(p_locator)<=2048
$$;
REVOKE ALL ON FUNCTION kg.studio_source_by_locator(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kg.studio_source_by_locator(text) TO kg_studio_publish;
COMMIT;
