-- Run on the private editorial database after testing against its current schema.
\set ON_ERROR_STOP on
BEGIN;
CREATE TYPE public.enum_multi_source_reviews_review_mode AS ENUM ('independent', 'operator');
ALTER TABLE public.multi_source_reviews ADD COLUMN review_mode public.enum_multi_source_reviews_review_mode NOT NULL DEFAULT 'independent';
COMMIT;
