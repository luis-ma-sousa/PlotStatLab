"""Check official PSL releases and safely update managed program files.

Runtime environments live outside code transactions, keyed by dependency hash.
Old environments and program-file backups remain available for recovery. Project
files, browser storage, exports, credentials and runtime caches are never promoted
or removed by the updater.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

REPOSITORY = 'luis-ma-sousa/PlotStatLab'
MAX_ZIP_BYTES = 100 * 1024 * 1024
MAX_UNPACKED_BYTES = 256 * 1024 * 1024
MAX_FILES = 5000
ALLOWED_DIRECTORIES = {'dist', 'src', 'server', 'scripts', 'docs', 'tests', '.github', 'examples', 'schemas', 'licenses', 'manuals'}
ALLOWED_ROOT_FILES = {'LICENSE', 'NOTICE', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md',
                      'THIRD_PARTY_NOTICES.md', 'CODE_OF_CONDUCT.md', 'package.json', 'pnpm-lock.yaml',
                      'pnpm-workspace.yaml', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts',
                      'playwright.config.ts', 'index.html', 'requirements.txt', 'requirements-lock.txt',
                      'requirements-runtime.txt', 'Start PlotStatLab.bat', 'Start PlotStatLab.command',
                      'start-plotstatlab.sh', '.gitignore', '.gitattributes', '.editorconfig', 'release-manifest.json'}
# Scientific work must never become a managed update target, even in a crafted ZIP.
USER_DATA_SUFFIXES = {'.labplot', '.psl', '.csv', '.tsv', '.xlsx', '.xls', '.h5', '.hdf5', '.rds'}


class UpdateError(RuntimeError):
    pass


class UpdateInProgress(UpdateError):
    pass


class SafeGitHubRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlparse(newurl)
        host = parsed.hostname or ''
        if parsed.scheme != 'https' or not (host == 'github.com' or host.endswith('.github.com') or host.endswith('.githubusercontent.com')):
            raise UpdateError('The release download redirected outside GitHub.')
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected and urllib.parse.urlparse(req.full_url).hostname != host:
            redirected.remove_header('Authorization')
        return redirected


def github_token() -> str | None:
    token = os.environ.get('PSL_GITHUB_TOKEN') or os.environ.get('GH_TOKEN')
    if token:
        return token.strip()
    gh = shutil.which('gh')
    if gh:
        try:
            result = subprocess.run([gh, 'auth', 'token', '--hostname', 'github.com'], capture_output=True, text=True, timeout=3, check=False)
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            pass
    return None


def github_get(path: str, *, binary: bool = False, max_bytes: int = 4 * 1024 * 1024) -> bytes:
    if not path.startswith('/repos/') or '\n' in path or '\r' in path:
        raise UpdateError('Invalid GitHub API path.')
    headers = {'Accept': 'application/octet-stream' if binary else 'application/vnd.github+json',
               'User-Agent': 'PlotStatLab-Updater/0.2', 'X-GitHub-Api-Version': '2022-11-28'}
    token = github_token()
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request('https://api.github.com' + path, headers=headers)
    opener = urllib.request.build_opener(SafeGitHubRedirect())
    chunks = []
    count = 0
    deadline = time.monotonic() + (45 if binary else 8)
    with opener.open(request, timeout=5) as response:
        while True:
            if time.monotonic() > deadline:
                raise UpdateError('The release download timed out.')
            chunk = response.read(min(65536, max_bytes + 1 - count))
            if not chunk:
                break
            count += len(chunk)
            if count > max_bytes:
                raise UpdateError('The release download exceeds the size limit.')
            chunks.append(chunk)
    return b''.join(chunks)


def version_tuple(value: str) -> tuple[int, int, int]:
    if not isinstance(value, str) or not re.fullmatch(r'v?\d+\.\d+\.\d+', value):
        raise UpdateError('Only stable three-part release versions are supported.')
    return tuple(int(part) for part in value.lstrip('v').split('.'))


def safe_relative(value: str) -> str:
    if not isinstance(value, str) or not value or '\\' in value or '\x00' in value or ':' in value:
        raise UpdateError('Invalid update path.')
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or '.' in path.parts or str(path) != value or any(part.endswith((' ', '.')) for part in path.parts):
        raise UpdateError('Unsafe update path.')
    if any(re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', part, re.I) for part in path.parts):
        raise UpdateError('The release contains a filename reserved by Windows.')
    if path.suffix.lower() in USER_DATA_SUFFIXES:
        raise UpdateError('The release tries to replace a project or scientific data file.')
    if len(path.parts) == 1:
        if value not in ALLOWED_ROOT_FILES:
            raise UpdateError('The release contains an unmanaged root file.')
    elif path.parts[0] not in ALLOWED_DIRECTORIES:
        raise UpdateError('The release contains an unmanaged directory.')
    if any(part in {'.git', '.runtime', '.updates', '.venv', 'node_modules', '__pycache__'} for part in path.parts):
        raise UpdateError('The release contains a protected local directory.')
    return value


def checked_target(root: Path, relative: str) -> Path:
    relative = safe_relative(relative)
    target = root / relative
    # No update may follow a user's symlink out of the installation directory.
    current = root
    for part in PurePosixPath(relative).parts:
        current = current / part
        if current.is_symlink():
            raise UpdateError('A managed program path is a symbolic link; the update was left unapplied.')
    return target


def parse_manifest(value: bytes, expected_version: str | None = None) -> dict:
    try:
        manifest = json.loads(value)
    except (ValueError, UnicodeDecodeError) as exc:
        raise UpdateError('The release manifest is not valid JSON.') from exc
    if not isinstance(manifest, dict) or manifest.get('schemaVersion') != 1 or manifest.get('application') != 'PlotStatLab':
        raise UpdateError('This release manifest is not a supported PlotStatLab package.')
    version_tuple(manifest.get('version', ''))
    if expected_version and manifest['version'] != expected_version:
        raise UpdateError('Release version and package manifest do not match.')
    if 1 not in manifest.get('projectSchemaVersions', []):
        raise UpdateError('This release cannot read the installed project format.')
    files = manifest.get('files')
    if not isinstance(files, dict) or not files or len(files) > MAX_FILES:
        raise UpdateError('The release manifest has an invalid file list.')
    for name, digest in files.items():
        safe_relative(name)
        if name == 'release-manifest.json' or not isinstance(digest, str) or not re.fullmatch(r'[a-f0-9]{64}', digest):
            raise UpdateError('The release manifest has an invalid checksum.')
    required = {'dist/index.html', 'package.json', 'requirements-runtime.txt', 'scripts/bootstrap.py', 'scripts/launch.py', 'scripts/updater.py', 'LICENSE'}
    if not required.issubset(files):
        raise UpdateError('The release is missing essential application files.')
    return manifest


def extract_verified(archive: Path, destination: Path, expected_version: str) -> dict:
    with zipfile.ZipFile(archive) as package:
        entries = package.infolist()
        if len(entries) > MAX_FILES + 50 or sum(entry.file_size for entry in entries) > MAX_UNPACKED_BYTES:
            raise UpdateError('The release archive exceeds the extraction limit.')
        paths = set()
        folded_paths = set()
        members = {}
        for entry in entries:
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise UpdateError('Symbolic links are not allowed in a release.')
            if not entry.filename.startswith('PlotStatLab/'):
                raise UpdateError('The ZIP does not have the expected PlotStatLab folder.')
            relative = entry.filename[len('PlotStatLab/'):]
            if entry.is_dir():
                continue
            safe_relative(relative)
            if relative.casefold() in folded_paths:
                raise UpdateError('The release contains duplicate or case-colliding file paths.')
            folded_paths.add(relative.casefold())
            if entry.file_size > 64 * 1024 * 1024 or (entry.compress_size and entry.file_size / entry.compress_size > 1000):
                raise UpdateError('The release contains an oversized or suspicious compressed file.')
            paths.add(relative)
            members[relative] = entry
        if 'release-manifest.json' not in members:
            raise UpdateError('The release manifest is missing.')
        manifest = parse_manifest(package.read(members['release-manifest.json']), expected_version)
        if paths != set(manifest['files']) | {'release-manifest.json'}:
            raise UpdateError('The archive and manifest file lists differ.')
        for relative, entry in members.items():
            data = package.read(entry)
            if relative != 'release-manifest.json' and hashlib.sha256(data).hexdigest() != manifest['files'][relative]:
                raise UpdateError('A release file failed its checksum verification.')
            target = checked_target(destination, relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            target.chmod(0o755 if relative.endswith(('.sh', '.command')) else 0o644)
    return manifest


def installed_manifest(root: Path) -> dict:
    path = root / 'release-manifest.json'
    if not path.is_file():
        raise UpdateError('This installation has no release manifest. Download the current ready-to-use ZIP once to enable automatic updates.')
    return parse_manifest(path.read_bytes())


def journal_file(root: Path) -> Path:
    if (root / '.updates').is_symlink():
        raise UpdateError('The local update directory is a symbolic link; automatic updates are disabled.')
    return root / '.updates' / 'transaction.json'


def write_json_atomic(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(value, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def replace_bytes(target: Path, data: bytes, executable: bool = False) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name('.psl-update-' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(0o755 if executable else 0o644)
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            temporary.unlink()


def rollback_transaction(root: Path, journal: dict) -> None:
    backup_name = journal.get('backup', '')
    if not re.fullmatch(r'backup-[a-f0-9]{32}', backup_name):
        raise UpdateError('The recovery journal has an invalid backup path.')
    backup = root / '.updates' / backup_name
    for item in reversed(journal.get('paths', [])):
        relative = safe_relative(item['path'])
        target = checked_target(root, relative)
        saved = backup / relative
        if item['existed']:
            if not saved.is_file() or saved.is_symlink():
                raise UpdateError('An update backup is incomplete. Keep this installation intact and restore the backup before continuing.')
            replace_bytes(target, saved.read_bytes(), bool(saved.stat().st_mode & stat.S_IXUSR))
        elif target.exists():
            if not target.is_file():
                raise UpdateError('A recovery target is no longer a managed file.')
            target.unlink()
    journal_file(root).unlink(missing_ok=True)


def recover_interrupted_update(root: Path) -> None:
    path = journal_file(root)
    if not path.is_file():
        return
    try:
        journal = json.loads(path.read_text(encoding='utf-8'))
        if journal.get('schemaVersion') != 1 or journal.get('state') != 'applying':
            raise UpdateError('The update recovery journal is unsupported.')
        rollback_transaction(root, journal)
        print('PlotStatLab: recovered the previous version after an interrupted update.', flush=True)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise UpdateError('The interrupted update could not be recovered automatically. Your project files have not been modified; keep .updates/ for recovery.') from exc


def apply_transaction(root: Path, stage: Path, manifest: dict, validate) -> None:
    old = installed_manifest(root)
    old_files = set(old['files']) | {'release-manifest.json'}
    new_files = set(manifest['files']) | {'release-manifest.json'}
    affected = sorted(old_files | new_files)
    for relative in affected:
        target = checked_target(root, relative)
        if target.exists() and (not target.is_file() or relative not in old_files):
            raise UpdateError('An unmanaged local file conflicts with this update; nothing was replaced.')
    backup_name = 'backup-' + uuid.uuid4().hex
    backup = root / '.updates' / backup_name
    backup.mkdir(parents=True)
    paths = []
    for relative in affected:
        target = checked_target(root, relative)
        existed = target.is_file()
        if existed:
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, saved)
        paths.append({'path': relative, 'existed': existed})
    journal = {'schemaVersion': 1, 'state': 'applying', 'backup': backup_name,
               'previousVersion': old['version'], 'nextVersion': manifest['version'], 'paths': paths}
    write_json_atomic(journal_file(root), journal)
    try:
        # Bootstrap/updater/manifest last: every visible file is always a complete old or new file.
        late = {'scripts/bootstrap.py', 'scripts/updater.py', 'release-manifest.json'}
        for relative in sorted(new_files, key=lambda name: (name in late, name)):
            source = stage / relative
            replace_bytes(checked_target(root, relative), source.read_bytes(), relative.endswith(('.sh', '.command')))
        for relative in old_files - new_files:
            checked_target(root, relative).unlink(missing_ok=True)
        validate()
    except BaseException:
        rollback_transaction(root, journal)
        raise
    journal_file(root).unlink(missing_ok=True)


def existing_server() -> bool:
    try:
        with urllib.request.urlopen('http://127.0.0.1:8765/api/health', timeout=.5) as response:
            value = json.load(response)
            return value.get('application') == 'PlotStatLab'
    except (OSError, ValueError):
        return False


def local_uv(root: Path) -> str | None:
    executable = root / '.runtime' / 'uv' / ('uv.exe' if os.name == 'nt' else 'uv')
    return str(executable) if executable.is_file() else shutil.which('uv')


def check_application(root: Path, python: Path, version: str, env: dict) -> None:
    with socket.socket() as reserve:
        reserve.bind(('127.0.0.1', 0))
        port = reserve.getsockname()[1]
    process = subprocess.Popen([str(python), str(root / 'scripts/launch.py'), '--no-browser', '--port', str(port)],
                               cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline and process.poll() is None:
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=.5) as response:
                    health = json.load(response)
                if health.get('application') == 'PlotStatLab' and health.get('status') == 'ok' and health.get('version') == version:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=1) as response:
                        if response.status == 200:
                            return
            except (OSError, ValueError):
                pass
            time.sleep(.1)
        raise UpdateError('The new application did not pass its local health check.')
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def validate_staged_release(root: Path, stage: Path, version: str) -> tuple[Path, dict]:
    env = os.environ.copy()
    env['PSL_RUNTIME_ROOT'] = str((root / '.runtime').resolve())
    env['PSL_NO_UPDATE'] = '1'
    command = [sys.executable, str(stage / 'scripts/bootstrap.py'), '--check', '--runtime-path', '--no-update']
    uv = local_uv(root)
    if uv:
        command += ['--uv', uv]
    result = subprocess.run(command, cwd=stage, env=env, capture_output=True, text=True, timeout=240, check=False)
    paths = [line.removeprefix('PSL_RUNTIME_PYTHON=') for line in result.stdout.splitlines() if line.startswith('PSL_RUNTIME_PYTHON=')]
    if result.returncode != 0 or len(paths) != 1:
        raise UpdateError('The update could not prepare and verify its isolated dependencies. The installed version was kept.')
    python = Path(paths[0])
    if not python.is_file() or not python.resolve().is_relative_to((root / '.runtime').resolve()):
        raise UpdateError('The staged runtime points outside the local runtime cache.')
    check_application(stage, python, version, env)
    return python, env


def check_and_update(root: Path) -> bool:
    root = Path(root).resolve()
    recover_interrupted_update(root)
    if os.environ.get('PSL_NO_UPDATE') == '1':
        return False
    repository = os.environ.get('PSL_UPDATE_REPOSITORY', REPOSITORY)
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        print('PlotStatLab: the update repository setting is invalid; opening the installed version.', flush=True)
        return False
    stage_parent = None
    try:
        current_version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
        print('PlotStatLab: checking for updates...', flush=True)
        release = json.loads(github_get(f'/repos/{repository}/releases/latest'))
        if release.get('draft') or release.get('prerelease'):
            return False
        version = release.get('tag_name', '').removeprefix('v')
        if version_tuple(version) <= version_tuple(current_version):
            print('PlotStatLab: the installed version is up to date.', flush=True)
            return False
        if (root / '.git').exists() or (root / 'src' / 'App.tsx').exists():
            print('PlotStatLab: a newer release is available. This developer checkout was preserved; use the ready-to-use release for automatic updates.', flush=True)
            return False
        if existing_server():
            print('PlotStatLab: an update is available. Close the running PSL server; the next launch will install it.', flush=True)
            return False
        installed_manifest(root)  # Require a known managed-file list before downloading a candidate.
        assets = {asset.get('name'): asset for asset in release.get('assets', [])}
        filename = f'PlotStatLab-update-{version}.zip' if f'PlotStatLab-update-{version}.zip' in assets else f'PlotStatLab-{version}.zip'
        if filename not in assets or filename + '.sha256' not in assets:
            raise UpdateError('The latest release does not include a ready-to-use package and checksum.')
        def download(name, limit):
            asset_id = assets[name].get('id')
            if not isinstance(asset_id, int) or asset_id <= 0:
                raise UpdateError('The release asset ID is invalid.')
            return github_get(f'/repos/{repository}/releases/assets/{asset_id}', binary=True, max_bytes=limit)
        expected = download(filename + '.sha256', 4096).decode('ascii').split()[0]
        if not re.fullmatch(r'[a-fA-F0-9]{64}', expected):
            raise UpdateError('The release checksum is invalid.')
        payload = download(filename, MAX_ZIP_BYTES)
        if hashlib.sha256(payload).hexdigest() != expected.lower():
            raise UpdateError('The downloaded release failed its checksum verification.')
        updates = root / '.updates'
        updates.mkdir(exist_ok=True)
        stage_parent = Path(tempfile.mkdtemp(prefix='staging-', dir=updates))
        archive = stage_parent / filename
        archive.write_bytes(payload)
        stage = stage_parent / 'PlotStatLab'
        manifest = extract_verified(archive, stage, version)
        if json.loads((stage / 'package.json').read_text(encoding='utf-8'))['version'] != version:
            raise UpdateError('The release application version does not match its tag.')
        print(f'PlotStatLab: preparing update {version} while keeping the installed version available...', flush=True)
        python, env = validate_staged_release(root, stage, version)
        apply_transaction(root, stage, manifest, lambda: check_application(root, python, version, env))
        print(f'PlotStatLab: updated to {version}. Previous program files are backed up in .updates/.', flush=True)
        return True
    except (OSError, ValueError, KeyError, IndexError, TypeError, UpdateError, zipfile.BadZipFile, subprocess.SubprocessError) as exc:
        if journal_file(root).is_file():
            recover_interrupted_update(root)
        if isinstance(exc, urllib.error.HTTPError) and exc.code in (401, 403, 404):
            message = 'No stable release is available, or this private repository is not accessible.'
        elif isinstance(exc, (urllib.error.URLError, TimeoutError, socket.timeout)):
            message = 'The update service is unavailable or this computer is offline.'
        else:
            message = str(exc)
        print(f'PlotStatLab: {message} Opening the installed version.', flush=True)
        return False
    finally:
        if stage_parent is not None and stage_parent.is_dir() and stage_parent.parent == root / '.updates':
            shutil.rmtree(stage_parent)


def process_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == 'nt':
        import ctypes
        kernel = ctypes.windll.kernel32
        from ctypes import wintypes
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel.GetExitCodeProcess.restype = wintypes.BOOL
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return False
        try:
            exit_code = wintypes.DWORD()
            return bool(kernel.GetExitCodeProcess(handle, ctypes.byref(exit_code))) and exit_code.value == 259
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def update_on_launch(root: Path, disabled: bool = False) -> bool:
    """Serialize startup transactions so double-clicking cannot race recovery/apply."""
    root = Path(root)
    journal_file(root)  # Reject a linked update directory before creating the lock.
    directory = root / '.updates'
    directory.mkdir(exist_ok=True)
    lock = directory / 'launch-update.lock'
    token = uuid.uuid4().hex
    for attempt in range(2):
        try:
            with lock.open('x', encoding='utf-8') as stream:
                json.dump({'pid': os.getpid(), 'token': token, 'createdAt': time.time()}, stream)
                stream.flush()
                os.fsync(stream.fileno())
            break
        except FileExistsError:
            try:
                owner = json.loads(lock.read_text(encoding='utf-8'))
                alive = process_alive(int(owner['pid']))
            except (OSError, ValueError, KeyError, TypeError):
                alive = time.time() - lock.stat().st_mtime < 600
            if alive or attempt:
                raise UpdateInProgress('PlotStatLab: another launch is preparing an update. Keep its window open; it will start the editor when ready.')
            lock.unlink(missing_ok=True)
    try:
        recover_interrupted_update(root)
        return False if disabled else check_and_update(root)
    finally:
        try:
            if json.loads(lock.read_text(encoding='utf-8')).get('token') == token:
                lock.unlink(missing_ok=True)
        except (OSError, ValueError):
            pass
