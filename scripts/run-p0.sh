#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="dechive-wiki-p0-db"
LABEL="dechive.wiki.scope"
VALUE="p0-isolated"
# Observed pinned PostgreSQL 17.6 Alpine image (developer machine, ARM64).
IMAGE="postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94"
command -v docker >/dev/null || { echo "Docker unavailable"; exit 1; }
command -v python3 >/dev/null || { echo "Python unavailable"; exit 1; }
if docker container inspect "$NAME" >/dev/null 2>&1; then
  actual="$(docker inspect "$NAME" --format '{{index .Config.Labels "dechive.wiki.scope"}}')"
  if [[ "$actual" != "$VALUE" ]]; then
    echo "Refusing to touch unrecognized container $NAME"; exit 1
  fi
  docker rm -f "$NAME" >/dev/null
fi
echo "[P0] Starting isolated ephemeral PostgreSQL; no network or published ports."
docker run -d --name "$NAME" --label "$LABEL=$VALUE" \
  --network none --tmpfs /var/lib/postgresql/data:rw,size=256m \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --env POSTGRES_DB=dechive_wiki_p0 "$IMAGE" >/dev/null
ready=0
for _ in $(seq 1 45); do
  if docker exec "$NAME" pg_isready -U postgres -d dechive_wiki_p0 >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 1
done
[[ "$ready" == 1 ]] || { docker logs "$NAME" | tail -30; exit 1; }
for migration in "$ROOT"/db/[0-9][0-9][0-9]_*.sql; do
  echo "[P0] Applying $(basename "$migration")"
  docker exec -i "$NAME" psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d dechive_wiki_p0 -q -f - < "$migration"
done
echo "[P0] Executing live PostgreSQL integration tests."
cd "$ROOT"
python3 -m unittest discover -s tests -p 'test*.py' -v
echo "[P0] Completed; all database content is synthetic."
