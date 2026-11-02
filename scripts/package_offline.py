"""Create a host-specific ready-to-run ZIP with Python, uv and pinned wheels.

Create the seed with package_release.py, run its launcher --check, then point
--runtime at that installed .psl/.runtime. Virtual environments, user data, cache
and machine-specific launch pointers are intentionally excluded. The first
launch rebuilds a local environment from included wheels at its final path.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import stat
import zipfile

ROOT=Path(__file__).resolve().parents[1]
def platform_label()->str:
    system={'Darwin':'macOS','Windows':'Windows','Linux':'Linux'}.get(platform.system(),platform.system())
    architecture={'AMD64':'x64','x86_64':'x64','aarch64':'arm64','arm64':'arm64'}.get(platform.machine(),platform.machine())
    return system+'-'+architecture

def runtime_files(runtime:Path):
    for component in ['uv','python','wheels']:
        folder=runtime/component
        if not folder.is_dir():raise ValueError(f'The offline runtime is missing {component}. Install Python/uv and download the exact pinned wheels first.')
        for current,directories,names in os.walk(folder,followlinks=True):
            directories[:]=[d for d in directories if d not in {'__pycache__','.git','.lock'} and not (component=='python' and Path(current)==folder and ((Path(current)/d).is_symlink() or getattr(Path(current)/d,'is_junction',lambda:False)()))]
            for name in sorted(names):
                path=Path(current)/name
                if name.endswith(('.pyc','.lock')):continue
                resolved=path.resolve()
                if not resolved.is_relative_to(runtime.resolve()):raise ValueError(f'Runtime link points outside the local runtime: {path.name}')
                if not resolved.is_file():continue
                yield path,path.relative_to(runtime).as_posix()

def create_offline_package(seed:Path,runtime:Path,output:Path,version:str,label:str|None=None)->Path:
    files=list(runtime_files(runtime));wheels=[p for p,n in files if n.startswith('wheels/') and n.endswith('.whl')]
    if not wheels:raise ValueError('The offline wheel folder is empty.')
    output.mkdir(parents=True,exist_ok=True);target=output/f'PlotStatLab-{version}-offline-{label or platform_label()}.zip'
    manifest={}
    with zipfile.ZipFile(seed) as source,zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for item in source.infolist():archive.writestr(item,source.read(item))
        for path,name in files:
            data=path.read_bytes();destination='PlotStatLab/.psl/.runtime/'+name
            info=zipfile.ZipInfo(destination);info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(stat.S_IFREG|stat.S_IMODE(path.stat().st_mode))<<16
            archive.writestr(info,data);manifest[name]=hashlib.sha256(data).hexdigest()
        info={'version':version,'platform':label or platform_label(),'files':manifest}
        archive.writestr('PlotStatLab/.psl/.runtime/offline-manifest.json',json.dumps(info,indent=2)+'\n')
        archive.writestr('PlotStatLab/Offline package.txt','This package includes a local Python runtime, uv and exact scientific wheels.\nFirst launch creates a fresh environment at this folder path without downloading dependencies.\nUse the normal launcher. --offline --no-update also skips the optional release check.\nKeep the complete folder. Save workspace files independently of application components.\n')
    digest=hashlib.sha256(target.read_bytes()).hexdigest();target.with_name(target.name+'.sha256').write_text(digest+'  '+target.name+'\n',encoding='utf-8')
    return target

def main()->int:
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--seed',type=Path,required=True);parser.add_argument('--runtime',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();version=json.loads((ROOT/'package.json').read_text())['version'];print(create_offline_package(args.seed.resolve(),args.runtime.resolve(),args.output.resolve(),version));return 0
if __name__=='__main__':raise SystemExit(main())
