"""Build free native installation wrappers around PSL's verified user package.

The macOS launcher is immutable; its updatable runtime lives in Application
Support. Windows installation is per-user and does not require elevation.
Publisher-trusted signing requires externally supplied publisher credentials.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]

def checksum(path:Path)->None:
    path.with_name(path.name+'.sha256').write_text(hashlib.sha256(path.read_bytes()).hexdigest()+'  '+path.name+'\n',encoding='utf-8')

def prepare_macos(user_zip:Path,output:Path,version:str)->Path:
    app=output/'PlotStatLab.app';resources=app/'Contents'/'Resources';binary=app/'Contents'/'MacOS';resources.mkdir(parents=True,exist_ok=True);binary.mkdir(parents=True,exist_ok=True)
    shutil.copy2(user_zip,resources/'PlotStatLab.zip')
    info={'CFBundleName':'PlotStatLab','CFBundleDisplayName':'PlotStatLab','CFBundleIdentifier':'org.plotstatlab.desktop','CFBundleExecutable':'PlotStatLab','CFBundlePackageType':'APPL','CFBundleShortVersionString':version,'CFBundleVersion':version,'LSMinimumSystemVersion':'14.0','NSHighResolutionCapable':True}
    (app/'Contents'/'Info.plist').write_bytes(plistlib.dumps(info))
    launcher=binary/'PlotStatLab'
    launcher.write_text('''#!/bin/sh
set -eu
PSL_RESOURCES=$(CDPATH= cd -- "$(dirname -- "$0")/../Resources" && pwd)
PSL_SUPPORT=${PSL_NATIVE_HOME:-"$HOME/Library/Application Support/PlotStatLab"}
PSL_APP="$PSL_SUPPORT/application"
if [ ! -f "$PSL_APP/.psl/dist/index.html" ]; then
  mkdir -p "$PSL_SUPPORT"
  PSL_STAGE="$PSL_SUPPORT/.install-$$"
  mkdir "$PSL_STAGE"
  trap 'rmdir "$PSL_STAGE" 2>/dev/null || true' EXIT
  /usr/bin/ditto -x -k "$PSL_RESOURCES/PlotStatLab.zip" "$PSL_STAGE"
  if [ -e "$PSL_APP" ]; then
    printf '%s\\n' 'An incomplete installation exists. Preserve it and move it aside before retrying.' >&2
    exit 1
  fi
  mv "$PSL_STAGE/PlotStatLab" "$PSL_APP"
  rmdir "$PSL_STAGE"
  trap - EXIT
fi
if [ "$#" -gt 0 ] || [ "${PSL_NATIVE_CLI:-0}" = 1 ]; then
  exec /bin/sh "$PSL_APP/Start PlotStatLab.command" "$@"
fi
# Terminal displays first-setup progress and useful local error messages.
exec /usr/bin/open -a Terminal "$PSL_APP/Start PlotStatLab.command"
''',encoding='utf-8');launcher.chmod(0o755)
    return app

def _nsis_quote(value:str)->str:
    return value.replace('$','$$').replace('"','$\\"').replace('\n','')

def prepare_windows(user_zip:Path,output:Path,version:str)->Path:
    payload=output/'windows-payload';payload.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(user_zip) as archive:
        archive.extractall(payload)
        names=[entry.filename.removeprefix('PlotStatLab/') for entry in archive.infolist() if not entry.is_dir()]
    script=output/'PlotStatLab.nsi';installer=output/f'PlotStatLab-{version}-Windows-Setup.exe'
    delete='\n'.join('  Delete "$INSTDIR\\'+_nsis_quote(name.replace('/','\\'))+'"' for name in names)
    script.write_text('''Unicode true
!include "MUI2.nsh"
Name "PlotStatLab"
OutFile "'''+_nsis_quote(str(installer.resolve()))+'''"
InstallDir "$LOCALAPPDATA\\Programs\\PlotStatLab"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section "PlotStatLab"
  SetOutPath "$INSTDIR"
  File /r "'''+_nsis_quote(str((payload/'PlotStatLab').resolve()))+'''\\*.*"
  SetFileAttributes "$INSTDIR\\.psl" HIDDEN
  CreateDirectory "$SMPROGRAMS\\PlotStatLab"
  CreateShortcut "$SMPROGRAMS\\PlotStatLab\\PlotStatLab.lnk" "$INSTDIR\\Start PlotStatLab.bat"
  CreateShortcut "$DESKTOP\\PlotStatLab.lnk" "$INSTDIR\\Start PlotStatLab.bat"
  WriteUninstaller "$INSTDIR\\Uninstall PlotStatLab.exe"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PlotStatLab" "DisplayName" "PlotStatLab"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PlotStatLab" "DisplayVersion" "'''+_nsis_quote(version)+'''"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PlotStatLab" "UninstallString" '$\\"$INSTDIR\\Uninstall PlotStatLab.exe$\\"'
SectionEnd
Section "Uninstall"
  Delete "$SMPROGRAMS\\PlotStatLab\\PlotStatLab.lnk"
  RMDir "$SMPROGRAMS\\PlotStatLab"
  Delete "$DESKTOP\\PlotStatLab.lnk"
'''+delete+'''
  Delete "$INSTDIR\\Uninstall PlotStatLab.exe"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PlotStatLab"
  ; Runtime caches, update recovery copies and unknown/user files are preserved.
  RMDir "$INSTDIR"
SectionEnd
''',encoding='utf-8')
    return script

def build_native(user_zip:Path,output:Path,version:str,platform:str,prepare_only:bool=False)->list[Path]:
    output.mkdir(parents=True,exist_ok=True)
    if platform=='darwin':
        app=prepare_macos(user_zip,output,version)
        if prepare_only:return [app]
        subprocess.run(['codesign','--force','--deep','--sign','-',str(app)],check=True)
        subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
        # Publisher certificate signing/notarization is a separate optional release step.
        image_root=output/'macos-dmg';image_root.mkdir(exist_ok=True);shutil.copytree(app,image_root/app.name,dirs_exist_ok=True);(image_root/'Applications').symlink_to('/Applications')
        dmg=output/f'PlotStatLab-{version}-macOS.dmg'
        subprocess.run(['hdiutil','create','-volname','PlotStatLab','-srcfolder',str(image_root),'-ov','-format','UDZO',str(dmg)],check=True);checksum(dmg);return [dmg]
    if platform=='win32':
        script=prepare_windows(user_zip,output,version)
        if prepare_only:return [script]
        makensis=shutil.which('makensis') or r'C:\Program Files (x86)\NSIS\makensis.exe'
        subprocess.run([makensis,str(script)],check=True)
        installer=output/f'PlotStatLab-{version}-Windows-Setup.exe';checksum(installer);return [installer]
    raise ValueError('Native wrappers support macOS and Windows. Use the portable ZIP on Linux.')

def main()->int:
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--zip',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--platform',choices=['darwin','win32'],default=sys.platform);parser.add_argument('--prepare-only',action='store_true');args=parser.parse_args()
    version=json.loads((ROOT/'package.json').read_text())['version']
    for path in build_native(args.zip.resolve(),args.output.resolve(),version,args.platform,args.prepare_only):print(path)
    return 0
if __name__=='__main__':raise SystemExit(main())
