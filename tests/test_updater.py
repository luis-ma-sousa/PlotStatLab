"""Transactional updater tests. Remote data and processes are fully mocked."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import zipfile
import pytest

spec = importlib.util.spec_from_file_location('updater', Path(__file__).resolve().parents[1] / 'scripts/updater.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


def release_tree(root: Path, version='0.2.0', requirements='numpy==2.5.4\n'):
    contents = {'package.json': json.dumps({'version': version}), 'requirements-runtime.txt': requirements,
                'LICENSE': 'MIT\n', 'dist/index.html': f'<h1>PSL {version}</h1>',
                'scripts/bootstrap.py': '# bootstrap', 'scripts/launch.py': '# launch',
                'scripts/updater.py': '# updater', 'src/App.tsx': f'// {version}'}
    for name, value in contents.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value, encoding='utf-8')
    manifest = {'schemaVersion': 1, 'application': 'PlotStatLab', 'version': version,
                'projectSchemaVersions': [1], 'files': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in contents}}
    (root / 'release-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
    return manifest


def zip_tree(root):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as target:
        for file in root.rglob('*'):
            if file.is_file():
                target.writestr('PlotStatLab/' + file.relative_to(root).as_posix(), file.read_bytes())
    return stream.getvalue()


def remote_release(monkeypatch, payload, version='0.3.0'):
    release = {'tag_name': 'v' + version, 'draft': False, 'prerelease': False, 'assets': [
        {'name': f'PlotStatLab-{version}.zip', 'id': 1}, {'name': f'PlotStatLab-{version}.zip.sha256', 'id': 2}]}
    def github_get(path, **kwargs):
        if path.endswith('/latest'):
            return json.dumps(release).encode()
        if path.endswith('/1'):
            return payload
        if path.endswith('/2'):
            return (hashlib.sha256(payload).hexdigest() + ' package.zip').encode()
        pytest.fail('Unexpected GitHub API request: ' + path)
    monkeypatch.setattr(updater, 'github_get', github_get)
    monkeypatch.setattr(updater, 'existing_server', lambda: False)
    monkeypatch.delenv('PSL_NO_UPDATE', raising=False)
    monkeypatch.delenv('PSL_UPDATE_REPOSITORY', raising=False)


@pytest.mark.parametrize('value', ['../outside', '/outside', 'src/../../outside', 'src\\bad', '.runtime/python', '.git/config', 'study.labplot', 'examples/data.csv'])
def test_update_paths_cannot_target_user_data_or_escape(value):
    with pytest.raises(updater.UpdateError):
        updater.safe_relative(value)


def test_manifest_version_and_project_format_must_match(tmp_path):
    manifest = release_tree(tmp_path, '0.3.0')
    with pytest.raises(updater.UpdateError, match='version'):
        updater.parse_manifest(json.dumps(manifest).encode(), '0.4.0')
    manifest['projectSchemaVersions'] = [2]
    with pytest.raises(updater.UpdateError, match='project format'):
        updater.parse_manifest(json.dumps(manifest).encode())


def test_extraction_checks_every_file_hash(tmp_path):
    source = tmp_path / 'source'
    release_tree(source, '0.3.0')
    (source / 'src/App.tsx').write_text('modified after manifest')
    archive = tmp_path / 'bad.zip'
    archive.write_bytes(zip_tree(source))
    with pytest.raises(updater.UpdateError, match='checksum'):
        updater.extract_verified(archive, tmp_path / 'target', '0.3.0')


def test_extraction_rejects_symlinks_and_traversal(tmp_path):
    for filename, symlink in [('PlotStatLab/../outside', False), ('PlotStatLab/src/link', True)]:
        archive = tmp_path / ('link.zip' if symlink else 'traversal.zip')
        with zipfile.ZipFile(archive, 'w') as target:
            info = zipfile.ZipInfo(filename)
            info.external_attr = ((stat.S_IFLNK | 0o777) if symlink else (stat.S_IFREG | 0o644)) << 16
            target.writestr(info, 'outside')
        with pytest.raises(updater.UpdateError):
            updater.extract_verified(archive, tmp_path / 'target', '0.3.0')
    assert not (tmp_path / 'outside').exists()


def test_transaction_failure_restores_program_files_and_preserves_work(tmp_path):
    root, stage = tmp_path / 'installed', tmp_path / 'stage'
    old = release_tree(root)
    new = release_tree(stage, '0.3.0')
    work = root / 'my experiment.labplot'
    work.write_text('private work')
    with pytest.raises(updater.UpdateError, match='health'):
        updater.apply_transaction(root, stage, new, lambda: (_ for _ in ()).throw(updater.UpdateError('health failed')))
    assert json.loads((root / 'package.json').read_text())['version'] == old['version']
    assert (root / 'dist/index.html').read_text() == '<h1>PSL 0.2.0</h1>'
    assert work.read_text() == 'private work'
    assert not updater.journal_file(root).exists()
    assert len(list((root / '.updates').glob('backup-*'))) == 1


def test_interrupted_transaction_recovers_on_next_launch(tmp_path):
    root = tmp_path / 'installed'
    release_tree(root)
    backup = root / '.updates' / ('backup-' + 'a' * 32)
    backup.mkdir(parents=True)
    (backup / 'package.json').write_bytes((root / 'package.json').read_bytes())
    (root / 'package.json').write_text('{"version":"0.3.0"}')
    (root / 'src/new.ts').write_text('new file from interrupted update')
    updater.write_json_atomic(updater.journal_file(root), {'schemaVersion': 1, 'state': 'applying', 'backup': backup.name,
        'paths': [{'path': 'package.json', 'existed': True}, {'path': 'src/new.ts', 'existed': False}]})
    updater.recover_interrupted_update(root)
    assert json.loads((root / 'package.json').read_text())['version'] == '0.2.0'
    assert not (root / 'src/new.ts').exists()
    assert not updater.journal_file(root).exists()


def test_automatic_dependency_update_keeps_old_runtime_and_all_work(tmp_path, monkeypatch):
    root, remote = tmp_path / 'installed', tmp_path / 'remote'
    release_tree(root)
    release_tree(remote, '0.3.0', requirements='numpy==2.5.5\n')
    old_runtime = root / '.runtime/venvs/old-environment/python'
    old_runtime.parent.mkdir(parents=True)
    old_runtime.write_text('old runtime remains available')
    work = root / 'experiment.labplot'
    work.write_text('do not touch')
    remote_release(monkeypatch, zip_tree(remote))
    new_runtime = root / '.runtime/venvs/new-environment/python'
    def staged_validation(installed, stage, version):
        assert (stage / 'requirements-runtime.txt').read_text() == 'numpy==2.5.5\n'
        new_runtime.parent.mkdir(parents=True)
        new_runtime.write_text('new verified runtime')
        return new_runtime, {'PSL_RUNTIME_ROOT': str(root / '.runtime')}
    monkeypatch.setattr(updater, 'validate_staged_release', staged_validation)
    checks = []
    monkeypatch.setattr(updater, 'check_application', lambda installed, python, version, env: checks.append((python, version)))
    assert updater.check_and_update(root) is True
    assert json.loads((root / 'package.json').read_text())['version'] == '0.3.0'
    assert checks == [(new_runtime, '0.3.0')]
    assert old_runtime.read_text() == 'old runtime remains available'
    assert new_runtime.read_text() == 'new verified runtime'
    assert work.read_text() == 'do not touch'
    assert not list((root / '.updates').glob('staging-*'))


def test_running_server_defers_update_without_download(tmp_path, monkeypatch):
    release_tree(tmp_path)
    remote_release(monkeypatch, b'not needed')
    monkeypatch.setattr(updater, 'existing_server', lambda: True)
    assert updater.check_and_update(tmp_path) is False
    assert not (tmp_path / '.updates').exists()


def test_offline_update_failure_opens_installed_version(tmp_path, monkeypatch, capsys):
    release_tree(tmp_path)
    def offline(*args, **kwargs):
        raise updater.urllib.error.URLError('offline')
    monkeypatch.setattr(updater, 'github_get', offline)
    monkeypatch.delenv('PSL_NO_UPDATE', raising=False)
    assert updater.check_and_update(tmp_path) is False
    assert 'offline' in capsys.readouterr().out
    assert not (tmp_path / '.updates').exists()


def test_authentication_never_follows_asset_redirect_to_another_host():
    handler = updater.SafeGitHubRedirect()
    request = updater.urllib.request.Request('https://api.github.com/repos/test/repo/releases/assets/1', headers={'Authorization': 'Bearer private-token'})
    redirected = handler.redirect_request(request, None, 302, '', {}, 'https://release-assets.githubusercontent.com/signed-download')
    assert redirected.get_header('Authorization') is None
    with pytest.raises(updater.UpdateError):
        handler.redirect_request(request, None, 302, '', {}, 'https://untrusted.example/collect')


def test_windows_case_collisions_and_reserved_names_are_rejected(tmp_path):
    for path in ['docs/CON.txt', 'src/trailing.', 'docs/trailing ']:
        with pytest.raises(updater.UpdateError):
            updater.safe_relative(path)
    archive = tmp_path / 'case.zip'
    with zipfile.ZipFile(archive, 'w') as target:
        target.writestr('PlotStatLab/src/A.ts', 'first')
        target.writestr('PlotStatLab/src/a.ts', 'second')
    with pytest.raises(updater.UpdateError, match='case-colliding'):
        updater.extract_verified(archive, tmp_path / 'target', '0.3.0')


def test_startup_lock_does_not_recover_a_transaction_owned_by_another_live_launch(tmp_path, monkeypatch):
    import os
    directory=tmp_path/'.updates';directory.mkdir()
    (directory/'launch-update.lock').write_text(json.dumps({'pid':os.getpid(),'token':'other'}))
    monkeypatch.setattr(updater,'recover_interrupted_update',lambda root:pytest.fail('must not touch active update'))
    with pytest.raises(updater.UpdateInProgress):
        updater.update_on_launch(tmp_path)
    assert (directory/'launch-update.lock').exists()


def test_dead_startup_lock_is_recovered_and_released(tmp_path,monkeypatch):
    directory=tmp_path/'.updates';directory.mkdir()
    (directory/'launch-update.lock').write_text(json.dumps({'pid':99999999,'token':'dead'}))
    monkeypatch.setattr(updater,'process_alive',lambda pid:False)
    calls=[]
    monkeypatch.setattr(updater,'recover_interrupted_update',lambda root:calls.append('recover'))
    monkeypatch.setattr(updater,'check_and_update',lambda root:calls.append('check') or True)
    assert updater.update_on_launch(tmp_path) is True
    assert calls==['recover','check']
    assert not (directory/'launch-update.lock').exists()


def test_real_packager_produces_an_archive_the_updater_accepts(tmp_path):
    import importlib.util
    spec=importlib.util.spec_from_file_location('packaging_integration',Path(__file__).resolve().parents[1]/'scripts/package_release.py')
    package=importlib.util.module_from_spec(spec);spec.loader.exec_module(package)
    root=tmp_path/'source';root.mkdir();release_tree(root,'0.3.0')
    (root/'Start PlotStatLab.bat').write_text('launcher')
    (root/'Start PlotStatLab.command').write_text('launcher')
    (root/'examples').mkdir();(root/'examples'/'raw.csv').write_text('never manage scientific files')
    (root/'examples'/'fixture.json').write_text('{}')
    archive,_=package.create_package(root,tmp_path/'output')
    manifest=updater.extract_verified(archive,tmp_path/'stage','0.3.0')
    assert 'examples/raw.csv' not in manifest['files']
    assert 'examples/fixture.json' in manifest['files']
