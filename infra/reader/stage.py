"""Build a public-reader source tree; private editorial code is never copied."""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'experiments/payload-g1'
FILES = [
    'package.json', 'package-lock.json',
    'app/layout.tsx', 'app/page.tsx', 'app/archive-icon.tsx',
    'app/archive-search.tsx', 'app/domain-scroller.tsx',
    'app/random-discovery.tsx', 'app/reference-home.css', 'app/reading.css',
    'app/search/page.tsx', 'app/knowledge/[id]/page.tsx',
    'app/robots.txt/route.ts', 'lib/public-db.ts', 'lib/public-reading.ts',
]

def stage(destination):
    destination = Path(destination).resolve()
    if destination.exists():
        raise SystemExit('Destination must not exist; refusing to overwrite')
    destination.mkdir(parents=True)
    for name in FILES:
        source = SOURCE / name
        if not source.is_file() or source.is_symlink():
            raise SystemExit(f'Missing or unsafe source: {name}')
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    shutil.copytree(SOURCE / 'public', destination / 'public')
    shutil.copyfile(ROOT / 'infra/reader/next.config.mjs', destination / 'next.config.mjs')
    (destination / 'tsconfig.json').write_text(json.dumps({
        'compilerOptions': {
            'target': 'ES2017', 'lib': ['dom', 'dom.iterable', 'esnext'],
            'strict': True, 'skipLibCheck': True, 'noEmit': True,
            'esModuleInterop': True, 'module': 'esnext',
            'moduleResolution': 'bundler', 'resolveJsonModule': True,
            'isolatedModules': True, 'jsx': 'preserve',
            'plugins': [{'name': 'next'}],
        },
        'include': ['next-env.d.ts', 'app/**/*.ts', 'app/**/*.tsx',
                    'lib/**/*.ts', '.next/types/**/*.ts'],
        'exclude': ['node_modules'],
    }, indent=2) + '\n')
    print('READER_STAGE_OK: public routes only; no API, Studio or CMS config')

if __name__ == '__main__':
    stage(sys.argv[1])
