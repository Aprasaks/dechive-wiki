-- Disposable CI experiment only; run after Payload creates its schema.
-- Deployment requires a separate migration and restricted ownership review.
BEGIN;
CREATE TRIGGER multi_source_review_no_update_delete
 BEFORE UPDATE OR DELETE ON public.multi_source_reviews
 FOR EACH ROW EXECUTE FUNCTION kg.no_change();
CREATE TRIGGER multi_source_review_no_truncate
 BEFORE TRUNCATE ON public.multi_source_reviews
 FOR EACH STATEMENT EXECUTE FUNCTION kg.no_change();
COMMIT;
