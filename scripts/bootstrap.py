"""Install PSL's local Python environment once, then start the local editor.

Invoked by the platform launchers with a local managed Python 3.12. No Node.js,
compiler, administrator privileges or global PATH changes are required.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON_VERSION = (3, 12)
STAMP_VERSION = 1
PROBE = r'''
import importlib, importlib.metadata, json, sys
requirements = json.loads(sys.argv[1])
errors = []
if sys.version_info[:2] != (3, 12): errors.append('Python 3.12 required')
for name, expected in requirements.items():
    try:
        actual = importlib.metadata.version(name)
        if actual != expected: errors.append(name + ': ' + actual + ' != ' + expected)
    except importlib.metadata.PackageNotFoundError: errors.append(name + ': missing')
for name in ['numpy', 'scipy.stats', 'fastapi', 'uvicorn', 'pydantic']:
    try: importlib.import_module(name)
    except Exception as exc: errors.append(name + ': ' + str(exc))
print(json.dumps({'healthy': not errors, 'errors': errors}))
sys.exit(0 if not errors else 1)
'''


def runtime_root(root: Path = ROOT) -> Path:
    override = os.environ.get('PSL_RUNTIME_ROOT')
    return Path(override).resolve() if override else root / '.runtime'


def runtime_python(root: Path = ROOT) -> Path:
    return runtime_root(root) / 'venvs' / requirements_fingerprint(root) / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')


def pinned_requirements(path: Path, platform: str = sys.platform) -> dict[str, str]:
    """Read only exact runtime pins and the one explicit Windows marker we ship."""
    result = {}
    for raw in path.read_text(encoding='utf-8').splitlines():
        value = raw.split('#', 1)[0].strip()
        if not value:
            continue
        if ';' in value:
            value, marker = (s.strip() for s in value.split(';', 1))
            if marker != 'sys_platform == "win32"':
                raise ValueError(f'Unsupported runtime marker: {marker}')
            if platform != 'win32':
                continue
        match = re.fullmatch(r'([A-Za-z0-9_.-]+)==([A-Za-z0-9_.+!-]+)', value)
        if not match:
            raise ValueError(f'Runtime dependency must be pinned: {value}')
        name, version = match.groups()
        if name.lower() in result:
            raise ValueError(f'Duplicate runtime dependency: {name}')
        result[name.lower()] = version
    if not result:
        raise ValueError('The runtime dependency list is empty.')
    return result


def requirements_fingerprint(root: Path = ROOT) -> str:
    contents = (root / 'requirements-runtime.txt').read_bytes()
    return hashlib.sha256(b'PlotStatLab-runtime-v2-python3.12\0' + sys.platform.encode() + b'\0' + contents).hexdigest()


def probe_runtime(python: Path, requirements: dict[str, str]) -> bool:
    if not python.is_file():
        return False
    try:
        result = subprocess.run([str(python), '-I', '-c', PROBE, json.dumps(requirements)],
                                capture_output=True, text=True, timeout=30, check=False)
        return result.returncode == 0 and json.loads(result.stdout).get('healthy') is True
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        return False


def python_compatible(python: Path) -> bool:
    try:
        result = subprocess.run([str(python), '-I', '-c', 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 12) else 1)'], capture_output=True, timeout=10, check=False)
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def cached_runtime_valid(root: Path = ROOT) -> bool:
    stamp = runtime_python(root).parents[1] / '.psl-runtime.json'
    try:
        saved = json.loads(stamp.read_text(encoding='utf-8'))
        if saved != {'schema': STAMP_VERSION, 'fingerprint': requirements_fingerprint(root)}:
            return False
        return probe_runtime(runtime_python(root), pinned_requirements(root / 'requirements-runtime.txt'))
    except (OSError, ValueError, json.JSONDecodeError):
        return False


def local_environment(root: Path = ROOT) -> dict[str, str]:
    env = os.environ.copy()
    env.update({'UV_PYTHON_INSTALL_DIR': str(runtime_root(root) / 'python'),
                'UV_CACHE_DIR': str(runtime_root(root) / 'cache'),
                'UV_PYTHON_BIN_DIR': str(runtime_root(root) / 'python-bin'),
                'UV_NO_MODIFY_PATH': '1', 'UV_NO_PROGRESS': '1'})
    return env


def activate_runtime(root: Path, python: Path) -> None:
    # Staging validates a new environment without changing the installed launch hint.
    if os.environ.get('PSL_RUNTIME_ROOT'):
        return
    pointer = runtime_root(root) / 'active-python.txt'
    pointer.parent.mkdir(parents=True, exist_ok=True)
    temporary = pointer.with_suffix('.tmp')
    temporary.write_text(str(python), encoding='utf-8')
    os.replace(temporary, pointer)


def ensure_runtime(root: Path = ROOT, uv: str | None = None, offline: bool = False) -> Path:
    if not (root / 'dist' / 'index.html').is_file():
        raise RuntimeError('The compiled editor is missing. Extract the complete PlotStatLab ZIP again; do not copy only the launcher files.')
    requirements = pinned_requirements(root / 'requirements-runtime.txt')
    python = runtime_python(root)
    if cached_runtime_valid(root):
        print('PlotStatLab: dependencies verified; starting.', flush=True)
        activate_runtime(root, python)
        return python
    # A healthy existing venv can be adopted without downloading anything.
    if not probe_runtime(python, requirements):
        local_uv = runtime_root(root) / 'uv' / ('uv.exe' if os.name == 'nt' else 'uv')
        uv_path = uv or (str(local_uv) if local_uv.is_file() else shutil.which('uv'))
        if not uv_path:
            raise RuntimeError('The local installer was not found. Use Start PlotStatLab.bat, Start PlotStatLab.command or start-plotstatlab.sh.')
        env = local_environment(root)
        if offline:
            env['UV_OFFLINE'] = '1'
        venv = python.parents[1]
        if venv.is_symlink():
            raise RuntimeError('The runtime environment is a symbolic link. Extract a fresh PlotStatLab ZIP to install a local environment.')
        print('PlotStatLab: preparing the local environment. The first installation needs an Internet connection.', flush=True)
        if not python_compatible(python):
            # Keep older and damaged environments for recovery; never delete a cache entry.
            if venv.exists():
                venv.rename(venv.with_name(venv.name + '.recovery-' + uuid.uuid4().hex[:8]))
            subprocess.run([uv_path, 'venv', '--python', '3.12', '--managed-python', str(venv)],
                           env=env, check=True, cwd=root)
        subprocess.run([uv_path, 'pip', 'sync', '--python', str(python), '--only-binary', ':all:',
                        str(root / 'requirements-runtime.txt')], env=env, check=True, cwd=root)
        if not probe_runtime(python, requirements):
            raise RuntimeError('Installation finished, but dependency verification failed. Run the launcher again with an Internet connection.')
    stamp = python.parents[1] / '.psl-runtime.json'
    stamp.write_text(json.dumps({'schema': STAMP_VERSION, 'fingerprint': requirements_fingerprint(root)}, indent=2), encoding='utf-8')
    activate_runtime(root, python)
    return python


def check_updates(root: Path, disabled: bool) -> bool:
    updater_path = root / 'scripts' / 'updater.py'
    if not updater_path.is_file():
        return False
    spec = importlib.util.spec_from_file_location('psl_updater', updater_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    try:
        return bool(module.update_on_launch(root, disabled or os.environ.get('PSL_NO_UPDATE') == '1'))
    except module.UpdateInProgress as exc:
        print(str(exc), flush=True)
        raise SystemExit(0)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Set up and open PlotStatLab (PSL).')
    parser.add_argument('--uv', help=argparse.SUPPRESS)
    parser.add_argument('--quick-check', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--check', action='store_true', help='Install or verify without starting the server or opening a browser.')
    parser.add_argument('--runtime-path', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--no-browser', action='store_true', help='Start the server without opening a browser.')
    parser.add_argument('--no-update', action='store_true', help='Skip the update check for this launch.')
    parser.add_argument('--offline', action='store_true', help='Use only installed or cached resources.')
    args = parser.parse_args(argv)
    if args.quick_check:
        return 0 if cached_runtime_valid(ROOT) and (ROOT / 'dist/index.html').is_file() else 1
    if check_updates(ROOT, args.check or args.offline or args.no_update):
        os.execv(sys.executable, [sys.executable, str(ROOT / 'scripts/bootstrap.py'), *(argv if argv is not None else sys.argv[1:]), '--no-update'])
    try:
        python = ensure_runtime(ROOT, args.uv, args.offline)
        if args.check:
            if (ROOT / 'server' / 'app.py').is_file():
                subprocess.run([str(python), str(ROOT / 'scripts/launch.py'), '--check'], cwd=ROOT, check=True, timeout=30)
            print('PlotStatLab: installation is ready and verified.', flush=True)
            if args.runtime_path:
                print('PSL_RUNTIME_PYTHON=' + str(python), flush=True)
            return 0
        launch_args = ['--no-browser'] if args.no_browser else []
        return subprocess.call([str(python), str(ROOT / 'scripts/launch.py'), *launch_args], cwd=ROOT)
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f'PlotStatLab: {exc}', file=sys.stderr)
        print('First installation: check your Internet connection and extract the ZIP into a folder you can write to.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
