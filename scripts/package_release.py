"""Produce a deterministic, source-inclusive, ready-to-run PSL ZIP.

The package includes the compiled UI, but never a developer's Python/Node
installation, cache, symlink, git history, user data or credentials.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import zipfile

ROOT = Path(__file__).resolve().parents[1]
INCLUDE_DIRECTORIES = {'dist', 'src', 'server', 'scripts', 'docs', 'tests', '.github', 'examples', 'schemas', 'licenses', 'manuals'}
INCLUDE_FILES = {'LICENSE', 'NOTICE', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md',
                 'THIRD_PARTY_NOTICES.md', 'CODE_OF_CONDUCT.md', 'package.json', 'pnpm-lock.yaml',
                 'pnpm-workspace.yaml', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts',
                 'playwright.config.ts', 'index.html', 'requirements.txt', 'requirements-lock.txt',
                 'requirements-runtime.txt', 'Start PlotStatLab.bat', 'Start PlotStatLab.command',
                 'start-plotstatlab.sh', '.gitignore', '.gitattributes', '.editorconfig',
                 'release-manifest.json'}
USER_DATA_SUFFIXES = {'.psl','.labplot','.csv','.tsv','.xlsx','.xls','.h5','.hdf5','.rds'}
EXCLUDE_PARTS = {'__pycache__', '.pytest_cache', 'node_modules', '.venv', '.runtime', '.git', '.browsers', '.pnpm-store', 'test-results', 'playwright-report'}


def package_files(root: Path) -> list[Path]:
    files = []
    # Prune caches before traversal; a local .runtime can contain thousands of files.
    for current, directories, names in os.walk(root, followlinks=False):
        current_path = Path(current)
        if current_path == root:
            directories[:] = [name for name in directories if name in INCLUDE_DIRECTORIES]
        else:
            directories[:] = [name for name in directories if name not in EXCLUDE_PARTS]
        for directory in directories:
            if (current_path / directory).is_symlink():
                raise ValueError(f'Release cannot include symbolic link: {(current_path / directory).relative_to(root)}')
        for name in names:
            candidate = current_path / name
            relative = candidate.relative_to(root)
            if relative.name.endswith(('.pyc', '.log', '.tsbuildinfo')) or relative.suffix.lower() in USER_DATA_SUFFIXES:
                continue
            if (len(relative.parts) == 1 and relative.name in INCLUDE_FILES) or (relative.parts[0] in INCLUDE_DIRECTORIES):
                if candidate.is_symlink():
                    raise ValueError(f'Release cannot include symbolic link: {relative}')
                if relative.as_posix() != 'release-manifest.json':
                    files.append(candidate)
    return sorted(files)


def create_package(root: Path, output: Path) -> tuple[Path, Path]:
    if not (root / 'dist/index.html').is_file():
        raise ValueError('Build the frontend before packaging (dist/index.html missing).')
    for required in ['LICENSE', 'requirements-runtime.txt', 'scripts/bootstrap.py', 'scripts/launch.py', 'Start PlotStatLab.bat', 'Start PlotStatLab.command']:
        if not (root / required).is_file():
            raise ValueError(f'Release is missing: {required}')
    version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
    if not version or any(c not in '0123456789.-abcdefghijklmnopqrstuvwxyz' for c in version):
        raise ValueError('Package version is not a safe filename component.')
    files = package_files(root)
    manifest = {'schemaVersion': 1, 'application': 'PlotStatLab', 'version': version, 'projectSchemaVersions': [1],
                'files': {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
    manifest_bytes = (json.dumps(manifest, indent=2, ensure_ascii=False) + '\n').encode('utf-8')
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'PlotStatLab-{version}.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target:
        for name, content, mode in [(p.relative_to(root).as_posix(), p.read_bytes(), p.stat().st_mode) for p in files] + [('release-manifest.json', manifest_bytes, 0o100644)]:
            info = zipfile.ZipInfo('PlotStatLab/' + name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            executable = bool(mode & stat.S_IXUSR) or name.endswith(('.sh', '.command'))
            info.external_attr = (0o100755 if executable else 0o100644) << 16
            target.writestr(info, content)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    checksum = archive.with_suffix('.zip.sha256')
    checksum.write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
    return archive, checksum


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--output', type=Path, default=ROOT / 'releases')
    args = parser.parse_args()
    archive, checksum = create_package(args.root.resolve(), args.output.resolve())
    print(archive)
    print(checksum)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
