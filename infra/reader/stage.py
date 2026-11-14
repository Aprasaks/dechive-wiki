"""Assemble an allowlisted public-only Next.js source tree for DECHIVE.WIKI.

This is a build input, NOT a deployment or permission grant. Never copy CMS
routes, Payload configuration, reviewer data, or editor-only source.
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
    "app/layout.tsx", "app/page.tsx", "app/archive-icon.tsx", "app/site-header.tsx",
    "app/archive-search.tsx", "app/domain-scroller.tsx",
    "app/random-discovery.tsx", "app/reference-home.css",
    "app/reading.css", "app/search/page.tsx",
    "app/domains/[code]/page.tsx",
    "app/knowledge/[id]/page.tsx",
    "app/knowledge/share-controls.tsx",
    "app/robots.txt/route.ts",
    "lib/public-db.ts", "lib/public-reading.ts", "lib/article-body.tsx",
)
ASSETS = (
    "colosseum.webp", "hero-landscape-v2.webp", "hero.webp",
    "journey-ai.webp", "journey-civilization.webp", "journey-life.webp",
    "maya.webp", "trail-network-v2.webp", "trail.webp",
)

def stage(destination: Path) -> None:
    destination = destination.resolve()
    if destination == ROOT or ROOT in destination.parents:
        # Do not risk placing generated bundles in the tracked source tree.
        raise SystemExit("Use an external temporary destination, not a repository path")
    if destination.exists():
        raise SystemExit("Destination must not exist; refusing to overwrite")
    destination.mkdir(parents=True)
    for filename in FILES:
        original = SOURCE / filename
        if not original.is_file() or original.is_symlink():
            raise SystemExit(f"Missing or unsafe public source: {filename}")
        target = destination / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(original, target)
    # Only the reader release is indexable; keep the shared private fixture unchanged.
    layout = destination / "app/layout.tsx"
    text = layout.read_text()
    old = "robots: { index: false, follow: false }, // test lab: do not index the preview"
    if text.count(old) != 1:
        raise SystemExit("Unexpected reader robots metadata")
    layout.write_text(text.replace(old, "robots: { index: true, follow: true },"))
    robots = destination / "app/robots.txt/route.ts"
    robots.write_text("export function GET() { return new Response('User-agent: *\\nAllow: /\\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }) }\n")
    assets = SOURCE / "public" / "reference"
    for filename in ASSETS:
        original = assets / filename
        if not original.is_file() or original.is_symlink():
            raise SystemExit(f"Missing or unsafe public asset: {filename}")
        target = destination / "public" / "reference" / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(original, target)
    shutil.copyfile(ROOT / "infra" / "reader" / "next.config.mjs",
                    destination / "next.config.mjs")
    (destination / "tsconfig.json").write_text(json.dumps({
        "compilerOptions": {
            "target": "ES2017", "lib": ["dom", "dom.iterable", "esnext"],
            "strict": True, "skipLibCheck": True, "noEmit": True,
            "esModuleInterop": True, "module": "esnext",
            "moduleResolution": "bundler", "resolveJsonModule": True,
            "isolatedModules": True, "jsx": "preserve",
            "plugins": [{"name": "next"}],
        },
        "include": ["next-env.d.ts", "app/**/*.ts", "app/**/*.tsx",
                    "lib/**/*.ts", "lib/**/*.tsx", ".next/types/**/*.ts"],
        "exclude": ["node_modules"],
    }, indent=2) + "\n")
    forbidden = ("studio", "api", "payload", "draft", "review", "candidate")
    for path in destination.rglob("*"):
        if path.is_file() and path.suffix in (".tsx", ".ts", ".js", ".mjs"):
            rel = path.relative_to(destination).as_posix().lower()
            if rel.startswith(("app/studio/", "app/api/")):
                raise SystemExit(f"Private route leaked into public stage: {rel}")
    print("PUBLIC_READER_STAGE_OK: allowlisted public pages/assets only")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 infra/reader/stage.py /tmp/unique-reader-stage")
    stage(Path(sys.argv[1]))
