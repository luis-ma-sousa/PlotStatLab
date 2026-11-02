import importlib.util
from pathlib import Path
import zipfile
import json
import hashlib
import pytest
spec=importlib.util.spec_from_file_location('offline',Path(__file__).resolve().parents[1]/'scripts/package_offline.py');offline=importlib.util.module_from_spec(spec);spec.loader.exec_module(offline)
def test_offline_archive_includes_only_relocatable_seed_components_and_hash_inventory(tmp_path):
    seed=tmp_path/'seed.zip'
    with zipfile.ZipFile(seed,'w') as z:z.writestr('PlotStatLab/.psl/dist/index.html','Editor')
    runtime=tmp_path/'runtime'
    for component in ['uv','python','wheels','venvs','cache']:(runtime/component).mkdir(parents=True)
    (runtime/'uv/uv').write_bytes(b'uv');(runtime/'python/python').write_bytes(b'python');(runtime/'wheels/numpy-2.5.4-py3-none-any.whl').write_bytes(b'wheel');(runtime/'venvs/local-path.txt').write_text('machine path');(runtime/'cache/unknown').write_bytes(b'cache');(runtime/'active-python.txt').write_text('absolute path')
    package=offline.create_offline_package(seed,runtime,tmp_path/'output','0.3.0','test-host')
    with zipfile.ZipFile(package) as z:
        names=z.namelist();assert 'PlotStatLab/.psl/.runtime/python/python' in names;assert not any('/venvs/' in n or '/cache/' in n or 'active-python' in n for n in names)
        manifest=json.loads(z.read('PlotStatLab/.psl/.runtime/offline-manifest.json'));assert manifest['files']['uv/uv']==hashlib.sha256(b'uv').hexdigest()
    assert package.with_name(package.name+'.sha256').is_file()

def test_offline_archive_refuses_missing_or_empty_runtime_components(tmp_path):
    with pytest.raises(ValueError,match='missing'):list(offline.runtime_files(tmp_path))

@pytest.mark.skipif(__import__('os').name=='nt',reason='Creating directory symlinks requires special Windows privileges')
def test_managed_python_minor_alias_is_recreated_instead_of_copied_as_directory(tmp_path):
    runtime=tmp_path/'runtime'
    for component in ['uv','python','wheels']:(runtime/component).mkdir(parents=True)
    actual=runtime/'python/cpython-3.12.16-test';actual.mkdir();(actual/'python').write_bytes(b'python')
    (runtime/'python/cpython-3.12-test').symlink_to(actual,target_is_directory=True)
    assert [name for _,name in offline.runtime_files(runtime)]==['python/cpython-3.12.16-test/python']
