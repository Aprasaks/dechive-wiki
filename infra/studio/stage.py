"""Stage an isolated, migration-only private editorial application.

The G1 source is a fixture. This packager refuses unreviewed changes to its
critical config instead of silently shipping the fixture with DB push enabled.
This command stages files only; it never connects to AWS or PostgreSQL.
"""
from __future__ import annotations
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "experiments" / "payload-g1"
FILES = (
    "package.json", "package-lock.json",
    "app/layout.tsx",
    "app/studio/page.tsx", "app/studio/login/page.tsx",
    "app/studio/studio-client.tsx",
    "app/studio/private-article-preview.tsx",
    "app/api/[...slug]/route.ts", "app/api/graphql/route.ts",
    "proxy.ts",
    "http/candidate-endpoint.ts", "http/workflow-endpoints.ts", "http/direct-publication.ts",
    "http/reviewer-decision-endpoints.ts", "http/multi-review-status.ts",
    "http/seal-multi-review.ts",
    "lib/article-body.tsx", "lib/editorial-package.ts",
    "lib/multi-source-review.ts", "lib/multi-source-projection.ts",
)

def replace_once(value: str, before: str, after: str) -> str:
    if value.count(before) != 1:
        raise SystemExit("Unsafe G1 config drift: " + before[:75])
    return value.replace(before, after)

def stage(dest: Path) -> None:
    dest = dest.resolve()
    if dest == ROOT or ROOT in dest.parents:
        raise SystemExit("Stage outside the repository")
    if dest.exists():
        raise SystemExit("Stage destination already exists")
    dest.mkdir(parents=True)
    for path in FILES:
        src = SOURCE / path
        if not src.is_file() or src.is_symlink():
            raise SystemExit("Missing or unsafe approved source: " + path)
        dst = dest / path
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)

    staff_src = ROOT / "infra" / "studio" / "bootstrap-staff.ts"
    if not staff_src.is_file() or staff_src.is_symlink():
        raise SystemExit("Missing offline staff bootstrap")
    staff_dst = dest / "scripts" / "bootstrap-staff.ts"
    staff_dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(staff_src, staff_dst)

    migrations_src = ROOT / "infra" / "studio" / "migrations"
    if migrations_src.exists():
        if not migrations_src.is_dir() or migrations_src.is_symlink():
            raise SystemExit("Unsafe migration directory")
        migrations_dst = dest / "migrations"
        migrations_dst.mkdir()
        for file in migrations_src.iterdir():
            if not file.is_file() or file.is_symlink() or file.suffix != ".ts":
                raise SystemExit("Unexpected migration file: " + file.name)
            shutil.copyfile(file, migrations_dst / file.name)

    # Explicitly do NOT copy the fixture's test-only push config.
    fixture = (SOURCE / "native-auth.config.ts").read_text()
    fixture = replace_once(
        fixture,
        "push: true, // ONLY this disposable GitHub-hosted G1 fixture database",
        "push: false, // Mandatory: use reviewed migrations only")
    fixture = replace_once(
        fixture,
        "secret: process.env.PAYLOAD_SECRET ?? '',",
        "secret: operationalSecret,")
    fixture = replace_once(
        fixture,
        "push: false, // Mandatory: use reviewed migrations only",
        "push: false, // Reviewed migrations only, never schema push\n"
        "    disableCreateDatabase: true,\n"
        "    migrationDir: './migrations',")
    fixture = replace_once(
        fixture,
        "pool: { connectionString: process.env.DATABASE_URL ?? '' },",
        "pool: { connectionString: operationalDatabaseUrl },")
    origin = "process.env.G1_TRUSTED_ORIGIN || 'http://127.0.0.1:3100'"
    if fixture.count(origin) != 2:
        raise SystemExit("Unexpected origin handling in fixture")
    fixture = fixture.replace(origin, "operationalOrigin")
    fixture = replace_once(
        fixture,
        "// Isolated G1 security test config: separate from the existing P0/G1 fixture.\n"
        "// IMPORTANT: never deploy this disposable database-push config to production.",
        "// Private editorial runtime only. The source fixture is never copied into the package.")
    before = "type Actor = { id: number | string; role?: string; collection?: string }"
    safety = """// Fail closed if somebody starts the private app with a fixture URL, admin DB
// owner, insecure cookies or missing secrets. Never include these in the ZIP.
const operationalOrigin = process.env.G1_TRUSTED_ORIGIN ?? ''
let validatedOrigin: URL
try { validatedOrigin = new URL(operationalOrigin) }
catch { throw new Error('STUDIO_HTTPS_ORIGIN_REQUIRED') }
if (validatedOrigin.protocol !== 'https:' || validatedOrigin.origin !== operationalOrigin ||
    validatedOrigin.username || validatedOrigin.password ||
    process.env.G1_COOKIE_SECURE !== 'true') {
  throw new Error('STUDIO_HTTPS_AND_SECURE_COOKIES_REQUIRED')
}
const operationalSecret = process.env.PAYLOAD_SECRET ?? ''
if (Buffer.byteLength(operationalSecret, 'utf8') < 32) {
  throw new Error('STUDIO_PAYLOAD_SECRET_REQUIRED')
}
const operationalDatabaseUrl = process.env.DATABASE_URL ?? ''
let parsedDatabase: URL
try { parsedDatabase = new URL(operationalDatabaseUrl) }
catch { throw new Error('STUDIO_DEDICATED_DB_REQUIRED') }
if (!['postgres:', 'postgresql:'].includes(parsedDatabase.protocol) ||
    !parsedDatabase.hostname || !parsedDatabase.password ||
    !parsedDatabase.username.startsWith('kg_studio_') ||
    parsedDatabase.pathname !== (process.env.STUDIO_CI_SYNTHETIC === 'true'
      ? '/dechive_studio_ci' : '/dechive_studio')) {
  throw new Error('STUDIO_DEDICATED_DB_ROLE_REQUIRED')
}
for (const key of [
  'G1_REVIEWER_DATABASE_URL', 'G1_PUBLISHER_DATABASE_URL',
  'G1_CANDIDATE_DATABASE_URL', 'G1_REVIEW_ATTESTATION_SECRET',
  'G1_CANDIDATE_SECRET',
]) {
  if (!process.env[key]) throw new Error('STUDIO_SERVICE_CONFIGURATION_MISSING:' + key)
}
"""
    fixture = replace_once(fixture, before, safety + "\n" + before)
    if ("push: true" in fixture or "native-auth.config" in fixture or
            "disableCreateDatabase: true" not in fixture or
            "migrationDir: './migrations'" not in fixture):
        raise SystemExit("Fixture/push reference leaked into operational config")
    (dest / "operational-auth.config.ts").write_text(fixture)

    config = (SOURCE / "next.config.mjs").read_text()
    config = replace_once(config, "  reactStrictMode: true,", "  output: 'standalone',\n  reactStrictMode: true,")
    # Admin runtime serves only private auth/admin endpoints and must stay noindex.
    config = replace_once(config, "    return [\n", """    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
""")
    (dest / "next.config.mjs").write_text(config)
    (dest / "tsconfig.json").write_text(json.dumps({
        "compilerOptions": {
            "target": "ES2017", "lib": ["dom", "dom.iterable", "esnext"],
            "allowJs": True, "skipLibCheck": True, "strict": True,
            "noEmit": True, "esModuleInterop": True, "module": "esnext",
            "moduleResolution": "bundler", "resolveJsonModule": True,
            "isolatedModules": True, "jsx": "preserve",
            "plugins": [{"name": "next"}],
            "paths": {"@payload-config": ["./operational-auth.config.ts"]},
        },
        "include": ["next-env.d.ts", "app/**/*.ts", "app/**/*.tsx",
                    "http/**/*.ts", "lib/**/*.ts", "lib/**/*.tsx",
                    "operational-auth.config.ts", "proxy.ts",
                    ".next/types/**/*.ts"],
        "exclude": ["node_modules", "tests"],
    }, indent=2) + "\n")

    forbidden = (
        "native-auth.config.ts", "payload.config.ts", "app/knowledge",
        "app/search", "app/domains", "lib/public-db.ts",
        "lib/public-reading.ts", "db",
    )
    for name in forbidden:
        if (dest / name).exists():
            raise SystemExit("Unapproved public/fixture file staged: " + name)
    print("PRIVATE_STUDIO_STAGE_OK: dedicated DB; migration-only; private staff route")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 infra/studio/stage.py /tmp/new-private-studio")
    stage(Path(sys.argv[1]))
