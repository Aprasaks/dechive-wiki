-- G1 TEST ONLY: separate DB credentials and non-bypassable approval/publish grants.
-- Must run in an ephemeral PostgreSQL instance after KG core and public-reader SQL.
-- psql -v editor_password=<random> -v reviewer_password=<random> -v publisher_password=<random> -f ...
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE kg_g1_editor_probe LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
 PASSWORD :'editor_password';
CREATE ROLE kg_g1_reviewer_probe LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
 PASSWORD :'reviewer_password';
CREATE ROLE kg_g1_publisher_probe LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
 PASSWORD :'publisher_password';

-- Approval audit is not a user-supplied text field; the trusted login identity
-- is derived from the actual database session. Production needs a real identity
-- provider / per-reviewer proof, not three shared DB users.
CREATE TABLE kg.approval_audit (
 revision_id uuid PRIMARY KEY REFERENCES kg.approvals(revision_id),
 reviewer_login name NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_approval_audit BEFORE UPDATE OR DELETE
 ON kg.approval_audit FOR EACH ROW EXECUTE FUNCTION kg.no_change();

CREATE FUNCTION kg.approve_revision(p_revision uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, kg, pg_temp AS $$
BEGIN
 IF session_user <> 'kg_g1_reviewer_probe' THEN
   RAISE EXCEPTION 'NOT_REVIEWER_LOGIN' USING ERRCODE='42501';
 END IF;
 INSERT INTO kg.approvals(revision_id,reviewer)
 VALUES(p_revision,session_user::text);
 INSERT INTO kg.approval_audit(revision_id,reviewer_login)
 VALUES(p_revision,session_user);
END $$;

-- Existing publisher transaction runs under a privileged function identity,
-- but the caller's role is restricted to EXECUTE on this exact function.
-- This is a disposable CI test, not production privilege ownership.
ALTER FUNCTION kg.publish(uuid,uuid,bigint) SECURITY DEFINER;
ALTER FUNCTION kg.publish(uuid,uuid,bigint)
 SET search_path = pg_catalog, kg, pg_temp;

REVOKE ALL ON FUNCTION kg.approve_revision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION kg.publish(uuid,uuid,bigint) FROM PUBLIC;
GRANT USAGE ON SCHEMA kg TO kg_g1_reviewer_probe,kg_g1_publisher_probe;
GRANT SELECT ON kg.revisions,kg.claims,kg.claim_evidence,kg.sources
 TO kg_g1_reviewer_probe;
GRANT EXECUTE ON FUNCTION kg.approve_revision(uuid) TO kg_g1_reviewer_probe;
GRANT EXECUTE ON FUNCTION kg.publish(uuid,uuid,bigint) TO kg_g1_publisher_probe;
-- Editor role deliberately receives NO KG privileges and NO grant on schema kg.
-- Public reader remains a distinct role with approved-read view access only.
COMMIT;
