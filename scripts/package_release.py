"""Build a clean user ZIP and a separately verified runtime-update ZIP.

Developer sources remain in the repository. The user sees launchers and a quick
guide; runtime components are placed in the reserved .psl application folder.
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
INCLUDE_DIRECTORIES = {'dist', 'server', 'licenses', 'manuals'}
RUNTIME_SCRIPTS = {'bootstrap.py', 'bootstrap.sh', 'bootstrap.ps1', 'launch.py', 'updater.py'}
INCLUDE_FILES = {'LICENSE','NOTICE','THIRD_PARTY_NOTICES.md','requirements-runtime.txt','package.json'}
USER_DATA_SUFFIXES = {'.psl','.labplot','.csv','.tsv','.xlsx','.xls','.h5','.hdf5','.rds'}
EXCLUDE_PARTS = {'__pycache__','.pytest_cache','node_modules','.venv','.runtime','.git','.browsers','.updates','releases','test-results','playwright-report'}


def package_files(root: Path) -> list[Path]:
    files=[]
    for current,directories,names in os.walk(root,followlinks=False):
        current_path=Path(current)
        if current_path==root:
            directories[:]=[name for name in directories if name in INCLUDE_DIRECTORIES|{'scripts'}]
        else:
            directories[:]=[name for name in directories if name not in EXCLUDE_PARTS]
        for directory in directories:
            if (current_path/directory).is_symlink():
                raise ValueError(f'Release cannot include symbolic link: {(current_path/directory).relative_to(root)}')
        for name in names:
            candidate=current_path/name;relative=candidate.relative_to(root)
            included=(len(relative.parts)==1 and relative.name in INCLUDE_FILES) or relative.parts[0] in INCLUDE_DIRECTORIES or (relative.parts[0]=='scripts' and len(relative.parts)==2 and relative.name in RUNTIME_SCRIPTS)
            if not included or relative.name.endswith(('.pyc','.log','.tsbuildinfo','.map')) or relative.suffix.lower() in USER_DATA_SUFFIXES:continue
            if candidate.is_symlink():raise ValueError(f'Release cannot include symbolic link: {relative}')
            files.append(candidate)
    return sorted(files)


def write_archive(archive:Path,entries:list[tuple[str,bytes,bool]],hidden_folder:bool=False)->Path:
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as target:
        if hidden_folder:
            folder=zipfile.ZipInfo('PlotStatLab/.psl/',date_time=(1980,1,1,0,0,0));folder.create_system=3;folder.external_attr=(0o40755<<16)|0x12;target.writestr(folder,b'')
        for name,data,executable in entries:
            info=zipfile.ZipInfo('PlotStatLab/'+name,date_time=(1980,1,1,0,0,0));info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(0o100755 if executable else 0o100644)<<16;target.writestr(info,data)
    digest=hashlib.sha256(archive.read_bytes()).hexdigest();checksum=archive.with_suffix('.zip.sha256');checksum.write_text(f'{digest}  {archive.name}\n',encoding='utf-8');return checksum


def create_package(root:Path,output:Path)->tuple[Path,Path]:
    if not (root/'dist/index.html').is_file():raise ValueError('Build the frontend before packaging (dist/index.html missing).')
    for required in ['LICENSE','requirements-runtime.txt','scripts/bootstrap.py','scripts/launch.py','scripts/updater.py','scripts/bootstrap.sh','scripts/bootstrap.ps1','Start PlotStatLab.bat','Start PlotStatLab.command']:
        if not (root/required).is_file():raise ValueError(f'Release is missing: {required}')
    metadata=json.loads((root/'package.json').read_text(encoding='utf-8'));version=metadata['version']
    if not version or any(c not in '0123456789.-abcdefghijklmnopqrstuvwxyz' for c in version):raise ValueError('Package version is not a safe filename component.')
    entries=[]
    for file in package_files(root):
        name=file.relative_to(root).as_posix();content=file.read_bytes()
        if name=='package.json':content=(json.dumps({key:metadata[key] for key in ['name','version','license','description','repository'] if key in metadata},indent=2)+'\n').encode()
        entries.append((name,content,name.endswith(('.sh','.command'))))
    manifest={'schemaVersion':1,'distribution':'runtime','application':'PlotStatLab','version':version,'projectSchemaVersions':[1],'files':{name:hashlib.sha256(data).hexdigest() for name,data,_ in entries}}
    entries.append(('release-manifest.json',(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n').encode(),False))
    output.mkdir(parents=True,exist_ok=True);archive=output/f'PlotStatLab-update-{version}.zip';checksum=write_archive(archive,entries)
    return archive,checksum


def create_user_package(root:Path,output:Path,core:Path)->tuple[Path,Path]:
    version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version'];entries=[]
    with zipfile.ZipFile(core) as archive:
        for item in archive.infolist():
            if not item.is_dir():
                name=item.filename.removeprefix('PlotStatLab/');entries.append(('.psl/'+name,archive.read(item),name.endswith(('.sh','.command'))))
    for name in ['Start PlotStatLab.bat','Start PlotStatLab.command','start-plotstatlab.sh','LICENSE']:
        if (root/name).is_file():entries.append((name,(root/name).read_bytes(),name.endswith(('.sh','.command'))))
    guide=root/'manuals/QUICK-START.html'
    if guide.is_file():entries.append(('Quick start.html',guide.read_bytes().replace(b'href="/"',b'href="http://127.0.0.1:8765/"').replace(b'href="QUICK-START.html"',b'href=".psl/manuals/QUICK-START.html"'),False))
    instructions=f'''PlotStatLab {version}\n\n1. Extract this complete folder.\n2. Windows: double-click Start PlotStatLab.bat\n   macOS: double-click Start PlotStatLab.command\n   Linux: run sh start-plotstatlab.sh\n3. The first launch installs local dependencies and needs Internet access.\n   Later work can be offline.\n\nKeep the terminal window open while using the app.\nUse Help for the included offline manuals.\nSave workspace creates a portable .psl backup of all your work.\n\nApplication components are in the reserved .psl folder; keep it with the launchers.\nLicense: MIT.\n'''
    entries.append(('Read me.txt',instructions.encode(),False));archive=output/f'PlotStatLab-{version}.zip';return archive,write_archive(archive,entries,hidden_folder=True)


def main()->int:
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=ROOT);parser.add_argument('--output',type=Path,default=ROOT/'releases');args=parser.parse_args()
    core,core_hash=create_package(args.root.resolve(),args.output.resolve());user,user_hash=create_user_package(args.root.resolve(),args.output.resolve(),core)
    for file in [user,user_hash,core,core_hash]:print(file)
    return 0


if __name__=='__main__':raise SystemExit(main())
