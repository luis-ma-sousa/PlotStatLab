import importlib.util
from pathlib import Path
import plistlib
import os
import zipfile
import pytest
spec=importlib.util.spec_from_file_location('native',Path(__file__).resolve().parents[1]/'scripts/build_native.py');native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)
@pytest.fixture
def archive(tmp_path):
    path=tmp_path/'PlotStatLab-1.0.zip'
    with zipfile.ZipFile(path,'w') as target:
        target.writestr('PlotStatLab/.psl/dist/index.html','<html/>');target.writestr('PlotStatLab/Start PlotStatLab.command','#!/bin/sh\n');target.writestr('PlotStatLab/Start PlotStatLab.bat','@echo off\n');target.writestr('PlotStatLab/LICENSE','MIT')
    return path

def test_macos_bundle_uses_immutable_signed_launcher_and_external_updatable_application(archive,tmp_path):
    app=native.prepare_macos(archive,tmp_path/'mac','1.0.0');info=plistlib.loads((app/'Contents/Info.plist').read_bytes());assert info['CFBundleExecutable']=='PlotStatLab';assert info['CFBundleShortVersionString']=='1.0.0';launcher=app/'Contents/MacOS/PlotStatLab';text=launcher.read_text();assert 'Application Support/PlotStatLab' in text;assert 'PSL_NATIVE_HOME' in text;assert 'exec /bin/sh' in text;assert 'xattr' not in text;assert os.name=='nt' or launcher.stat().st_mode & 0o111;assert (app/'Contents/Resources/PlotStatLab.zip').read_bytes()==archive.read_bytes()

def test_windows_install_is_user_scope_and_uninstall_preserves_unknown_files(archive,tmp_path):
    script=native.prepare_windows(archive,tmp_path/'windows with spaces','1.0.0');text=script.read_text();assert 'RequestExecutionLevel user' in text;assert '$LOCALAPPDATA' in text;assert 'CreateShortcut' in text;assert 'Delete "$INSTDIR\\.psl\\dist\\index.html"' in text;assert 'RMDir /r' not in text;assert 'HKLM' not in text;assert 'HIDDEN' in text

def test_native_preparation_is_testable_without_host_signing_tools(archive,tmp_path):
    assert native.build_native(archive,tmp_path/'ready','1.0.0','darwin',True)[0].suffix=='.app'
    with pytest.raises(ValueError,match='portable'):native.build_native(archive,tmp_path/'linux','1.0.0','linux',True)
