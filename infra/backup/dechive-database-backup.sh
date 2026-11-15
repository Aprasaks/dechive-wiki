#!/bin/bash
set -euo pipefail
umask 077
export AWS_DEFAULT_REGION=ap-northeast-2
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
work="$(mktemp -d /var/tmp/dechive-backup.XXXXXX)"
trap 'rm -rf "$work"' EXIT
bucket="s3://dechive-wiki-private-backup-970853855285-seoul/database-daily/$stamp"
for db in dechive_reader_pilot dechive_studio; do
  docker exec wiki-reader-db pg_dump -U postgres -Fc "$db" > "$work/$db.dump"
  docker exec -i wiki-reader-db pg_restore -l < "$work/$db.dump" >/dev/null
done
docker exec wiki-reader-db pg_dumpall -U postgres --globals-only > "$work/globals.sql"
test -s "$work/globals.sql"
(cd "$work" && sha256sum dechive_reader_pilot.dump dechive_studio.dump globals.sql > SHA256SUMS)
for file in dechive_reader_pilot.dump dechive_studio.dump globals.sql SHA256SUMS; do
  aws s3 cp "$work/$file" "$bucket/$file" --sse AES256 --only-show-errors
done
echo "BACKUP_COMPLETE $stamp"
