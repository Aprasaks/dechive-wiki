#!/usr/bin/env bash
set -Eeuo pipefail
# EPHEMERAL CI ONLY; never run against production. This backup contains test data.
SRC="dechive_g1"; RESTORED="dechive_g1_restored"
: "$DATABASE_URL" "$PUBLIC_DATABASE_URL" "$PGPASSWORD"
psql_admin() {
  psql -X -A -t -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d "$1" -c "$2"
}
test "$(psql_admin "$SRC" "SELECT current_database()")" = "$SRC"
test "$(psql_admin postgres "SELECT count(*) FROM pg_database WHERE datname='$RESTORED'")" = "0"
test "$(psql_admin "$SRC" "SELECT count(*) FROM kg.heads")" -ge 2
BACKUP="$(mktemp -t dechive-g1-restore-XXXXXX.dump)"
trap 'rm -f "$BACKUP"' EXIT
echo "[G1 restore] pg_dump --format=custom from synthetic source"
pg_dump -h 127.0.0.1 -U postgres -d "$SRC" -Fc --file="$BACKUP"
test -s "$BACKUP"
createdb -h 127.0.0.1 -U postgres "$RESTORED"
pg_restore -h 127.0.0.1 -U postgres -d "$RESTORED" --no-owner --exit-on-error "$BACKUP"
TABLES_SQL="SELECT format('%I.%I',schemaname,tablename) FROM pg_tables WHERE schemaname IN ('kg','public') ORDER BY schemaname,tablename"
source_tables="$(psql_admin "$SRC" "$TABLES_SQL")"
restored_tables="$(psql_admin "$RESTORED" "$TABLES_SQL")"
test "$source_tables" = "$restored_tables"
count=0
while IFS= read -r relation; do
  test -n "$relation" || continue
  query="SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM $relation t"
  original="$(psql_admin "$SRC" "$query")"
  restored="$(psql_admin "$RESTORED" "$query")"
  if [[ "$original" != "$restored" ]]; then
    echo "RESTORE_CONTENT_MISMATCH: $relation" >&2; exit 1
  fi
  count=$((count+1))
done <<< "$source_tables"
test "$count" -ge 20
echo "PASS / all $count KG + Payload tables copied exactly"
VIEW_SQL="SELECT count(*)::text||':'||COALESCE(md5(string_agg(entity_id::text||':'||revision_id::text||':'||version::text||':'||body,'|' ORDER BY entity_id)),md5('')) FROM kg.public_entries"
test "$(psql_admin "$SRC" "$VIEW_SQL")" = "$(psql_admin "$RESTORED" "$VIEW_SQL")"
echo "PASS / published approved head view preserved"
SEARCH_SQL="SELECT count(*)::text||':'||COALESCE(md5(string_agg(entity_id::text||':'||revision_id::text||':'||version::text||':'||body,'|' ORDER BY entity_id)),md5('')) FROM kg.public_search_verified"
test "$(psql_admin "$SRC" "$SEARCH_SQL")" = "$(psql_admin "$RESTORED" "$SEARCH_SQL")"
echo "PASS / head-bound search view preserved"
READER_RESTORED="$(python3 -c 'import os;print(os.environ["PUBLIC_DATABASE_URL"].rsplit("/",1)[0]+"/dechive_g1_restored")')"
test "$(psql "$READER_RESTORED" -X -A -t -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM kg.public_entries')" -ge 2
test "$(psql "$READER_RESTORED" -X -A -t -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM kg.public_search_verified')" -ge 2
echo "PASS / restored public-reader access to approved views"
if psql "$READER_RESTORED" -X -A -t -v ON_ERROR_STOP=1 -c 'SELECT * FROM kg.revisions LIMIT 1' >/dev/null 2>&1; then
  echo "RESTORED_PRIVATE_READ_LEAK" >&2; exit 1
fi
if psql "$READER_RESTORED" -X -A -t -v ON_ERROR_STOP=1 -c 'SELECT kg.publish(NULL,NULL,0)' >/dev/null 2>&1; then
  echo "RESTORED_PUBLISH_PRIVILEGE_LEAK" >&2; exit 1
fi
echo "PASS / restored public reader still denied drafts and publish function"
psql_admin "$RESTORED" "INSERT INTO kg.entities(id,kind,name) VALUES('00000000-0000-4000-8000-000000090009','concept','Restored-only marker')" >/dev/null
test "$(psql_admin "$SRC" "SELECT count(*) FROM kg.entities WHERE name='Restored-only marker'")" = "0"
echo "PASS / restored database independent of source"
echo "G1_PGDUMP_RESTORE_${count}_TABLES_SUCCESS"
