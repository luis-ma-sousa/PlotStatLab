"""Bootstrap and release tests; no network or real browser/server needed."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import zipfile
import pytest


def load_module(name, relative):
    source = Path(__file__).resolve().parents[1] / relative
    spec = importlib.util.spec_from_file_location(name, source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

bootstrap = load_module('bootstrap', 'scripts/bootstrap.py')
package = load_module('package_release', 'scripts/package_release.py')
launch = load_module('launch', 'scripts/launch.py')


@pytest.fixture
def app_root(tmp_path):
    root = tmp_path / 'PlotStatLab with spaces'
    (root / 'dist').mkdir(parents=True)
    (root / 'dist/index.html').write_text('<html>PSL</html>', encoding='utf-8')
    (root / 'requirements-runtime.txt').write_text('numpy==2.5.4\nscipy==1.18.1\n', encoding='utf-8')
    (root / 'package.json').write_text('{"name":"plotstatlab","version":"0.2.0"}', encoding='utf-8')
    return root


def make_python(root):
    python = bootstrap.runtime_python(root)
    python.parent.mkdir(parents=True, exist_ok=True)
    python.write_text('dummy interpreter', encoding='utf-8')
    return python


def test_platform_pin_marker_is_explicit(tmp_path):
    pins = tmp_path / 'pins.txt'
    pins.write_text('numpy==2.5.4\ncolorama==0.4.6 ; sys_platform == "win32"\n')
    assert bootstrap.pinned_requirements(pins, 'darwin') == {'numpy': '2.5.4'}
    assert bootstrap.pinned_requirements(pins, 'win32') == {'numpy': '2.5.4', 'colorama': '0.4.6'}
    pins.write_text('numpy>=2\n')
    with pytest.raises(ValueError, match='pinned'):
        bootstrap.pinned_requirements(pins)


def test_changed_requirements_invalidate_fingerprint(app_root):
    before = bootstrap.requirements_fingerprint(app_root)
    (app_root / 'requirements-runtime.txt').write_text('numpy==2.5.5\n')
    assert bootstrap.requirements_fingerprint(app_root) != before


def test_stamp_is_not_trusted_without_real_dependency_probe(app_root, monkeypatch):
    make_python(app_root)
    stamp = {'schema': 1, 'fingerprint': bootstrap.requirements_fingerprint(app_root)}
    (bootstrap.runtime_python(app_root).parents[1] / '.psl-runtime.json').write_text(json.dumps(stamp))
    monkeypatch.setattr(bootstrap, 'probe_runtime', lambda *_: False)
    assert not bootstrap.cached_runtime_valid(app_root)


def test_valid_cached_runtime_never_installs(app_root, monkeypatch):
    python = make_python(app_root)
    monkeypatch.setattr(bootstrap, 'cached_runtime_valid', lambda *_: True)
    def forbidden(*a, **kw):
        raise AssertionError('Cached launch attempted dependency installation')
    monkeypatch.setattr(bootstrap.subprocess, 'run', forbidden)
    assert bootstrap.ensure_runtime(app_root, offline=True) == python


def test_existing_healthy_runtime_is_adopted_without_uv(app_root, monkeypatch):
    python = make_python(app_root)
    monkeypatch.setattr(bootstrap, 'cached_runtime_valid', lambda *_: False)
    monkeypatch.setattr(bootstrap, 'probe_runtime', lambda *_: True)
    monkeypatch.setattr(bootstrap.shutil, 'which', lambda *_: None)
    assert bootstrap.ensure_runtime(app_root) == python
    assert json.loads((bootstrap.runtime_python(app_root).parents[1] / '.psl-runtime.json').read_text())['fingerprint'] == bootstrap.requirements_fingerprint(app_root)


def test_missing_frontend_fails_before_dependency_work(app_root, monkeypatch):
    (app_root / 'dist/index.html').unlink()
    with pytest.raises(RuntimeError, match='compiled editor'):
        bootstrap.ensure_runtime(app_root)


def test_dependency_repair_keeps_compatible_python_in_place(app_root, monkeypatch):
    make_python(app_root)
    monkeypatch.setattr(bootstrap, 'cached_runtime_valid', lambda *_: False)
    probes = iter([False, True])
    monkeypatch.setattr(bootstrap, 'probe_runtime', lambda *_: next(probes))
    monkeypatch.setattr(bootstrap, 'python_compatible', lambda *_: True)
    calls = []
    monkeypatch.setattr(bootstrap.subprocess, 'run', lambda args, **kw: calls.append((args, kw)))
    bootstrap.ensure_runtime(app_root, uv='/local uv/uv', offline=True)
    assert len(calls) == 1
    assert calls[0][0][1:3] == ['pip', 'sync']
    assert '--only-binary' in calls[0][0]
    assert calls[0][1]['env']['UV_OFFLINE'] == '1'
    assert 'venv' not in calls[0][0]


def test_check_mode_skips_updates_browser_and_server(app_root, monkeypatch):
    monkeypatch.setattr(bootstrap, 'ROOT', app_root)
    updates = []
    monkeypatch.setattr(bootstrap, 'check_updates', lambda root, disabled: updates.append(disabled) or False)
    monkeypatch.setattr(bootstrap, 'ensure_runtime', lambda *_: app_root / 'python')
    monkeypatch.setattr(bootstrap.subprocess, 'call', lambda *_a, **_k: pytest.fail('check opened app'))
    assert bootstrap.main(['--check']) == 0
    assert updates == [True]


def test_no_update_environment_skips_updater_import(app_root, monkeypatch):
    monkeypatch.setenv('PSL_NO_UPDATE', '1')
    assert bootstrap.check_updates(app_root, False) is False


def complete_release_root(root):
    (root / 'scripts').mkdir()
    for name in ['bootstrap.py', 'launch.py', 'updater.py', 'bootstrap.sh', 'bootstrap.ps1']:
        (root / 'scripts' / name).write_text('# source\n')
    for name in ['LICENSE', 'Start PlotStatLab.bat', 'Start PlotStatLab.command']:
        (root / name).write_text('PSL\n')
    (root / 'manuals').mkdir()
    (root / 'manuals/index.html').write_text('<h1>Manual</h1>')


def test_package_is_deterministic_manifested_and_excludes_local_data(app_root, tmp_path):
    complete_release_root(app_root)
    for directory in ['.venv', '.runtime', '.git', 'node_modules']:
        (app_root / directory).mkdir()
        (app_root / directory / 'secret').write_text('MUST NOT SHIP')
    (app_root / '.env').write_text('TOKEN=secret')
    output = tmp_path / 'release output'
    archive, checksum = package.create_package(app_root, output)
    first = archive.read_bytes()
    assert checksum.read_text().startswith(hashlib.sha256(first).hexdigest())
    package.create_package(app_root, output)
    assert archive.read_bytes() == first
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        assert 'PlotStatLab/manuals/index.html' in names
        assert all('/src/' not in name and '/tests/' not in name for name in names)
        assert all('secret' not in n and '.env' not in n for n in names)
        manifest = json.loads(z.read('PlotStatLab/release-manifest.json'))
        assert manifest['application'] == 'PlotStatLab'
        assert manifest['projectSchemaVersions'] == [1]
        assert len(manifest['files']) == len(names) - 1
        for path, digest in manifest['files'].items():
            assert hashlib.sha256(z.read('PlotStatLab/' + path)).hexdigest() == digest
        executable = z.getinfo('PlotStatLab/scripts/bootstrap.sh').external_attr >> 16
        assert executable & 0o111


def test_package_refuses_included_symlinks(app_root, tmp_path):
    complete_release_root(app_root)
    link = app_root / 'server'
    link.mkdir()
    try:
        (link / 'external.ts').symlink_to(tmp_path / 'elsewhere')
    except OSError:
        pytest.skip('This account cannot create symlinks')
    with pytest.raises(ValueError, match='symbolic link'):
        package.create_package(app_root, tmp_path / 'out')


def test_existing_server_must_identify_plotstatlab(monkeypatch):
    monkeypatch.setattr(launch.urllib.request, 'urlopen', lambda *_a, **_k: io.BytesIO(b'{"status":"ok","engine":"SciPy"}'))
    assert launch.existing() is False
    monkeypatch.setattr(launch.urllib.request, 'urlopen', lambda *_a, **_k: io.BytesIO(b'{"application":"PlotStatLab","status":"ok"}'))
    assert launch.existing() is True


def test_runtime_cache_is_shared_between_staging_and_installation(app_root, tmp_path, monkeypatch):
    staged = tmp_path / 'staged'
    staged.mkdir()
    (staged / 'requirements-runtime.txt').write_bytes((app_root / 'requirements-runtime.txt').read_bytes())
    monkeypatch.setenv('PSL_RUNTIME_ROOT', str(app_root / '.runtime'))
    assert bootstrap.runtime_python(staged) == bootstrap.runtime_python(app_root)
    old = bootstrap.runtime_python(app_root)
    (staged / 'requirements-runtime.txt').write_text('numpy==2.5.5\n')
    assert bootstrap.runtime_python(staged) != old
    assert bootstrap.runtime_python(staged).is_relative_to(app_root / '.runtime')


def test_staging_does_not_change_the_active_runtime_hint(app_root, monkeypatch):
    monkeypatch.setenv('PSL_RUNTIME_ROOT', str(app_root / '.runtime'))
    python = make_python(app_root)
    monkeypatch.setattr(bootstrap, 'cached_runtime_valid', lambda *_: True)
    assert bootstrap.ensure_runtime(app_root) == python
    assert not (app_root / '.runtime/active-python.txt').exists()


def test_user_package_shows_launchers_and_hides_developer_material(app_root,tmp_path):
    complete_release_root(app_root)
    (app_root/'src').mkdir();(app_root/'src'/'App.tsx').write_text('developer source')
    (app_root/'tests').mkdir();(app_root/'tests'/'private.py').write_text('developer test')
    core,_=package.create_package(app_root,tmp_path/'out')
    user,_=package.create_user_package(app_root,tmp_path/'out',core)
    with zipfile.ZipFile(user) as archive:
        names=archive.namelist()
        assert 'PlotStatLab/Start PlotStatLab.bat' in names
        assert 'PlotStatLab/Start PlotStatLab.command' in names
        assert 'PlotStatLab/LICENSE' in names
        assert 'PlotStatLab/.psl/dist/index.html' in names
        assert 'PlotStatLab/.psl/manuals/index.html' in names
        assert all('/src/' not in name and '/tests/' not in name and '/.git/' not in name for name in names)
        assert archive.getinfo('PlotStatLab/.psl/').external_attr & 2
        assert all(name.startswith('PlotStatLab/.psl/') or name.split('/')[-1] in {'Start PlotStatLab.bat','Start PlotStatLab.command','start-plotstatlab.sh','LICENSE','Quick start.html','Read me.txt'} for name in names)
