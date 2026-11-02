# Windows PowerShell 5.1+. All tools and Python are installed inside this folder.
$ErrorActionPreference = 'Stop'
$LaunchArguments = @($args)
$PSLRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$VenvPython = ''
$Pointer = Join-Path $PSLRoot '.runtime\active-python.txt'
if (Test-Path $Pointer) { $VenvPython = (Get-Content -Raw $Pointer).Trim() }
$UvDirectory = Join-Path $PSLRoot '.runtime\uv'
$Uv = Join-Path $UvDirectory 'uv.exe'
$UvVersion = '0.13.6'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $PSLRoot '.runtime\python'
$env:UV_CACHE_DIR = Join-Path $PSLRoot '.runtime\cache'
$env:UV_PYTHON_BIN_DIR = Join-Path $PSLRoot '.runtime\python-bin'
$env:UV_NO_MODIFY_PATH = '1'
$env:UV_NO_PROGRESS = '1'
$Bootstrap = Join-Path $PSLRoot 'scripts\bootstrap.py'
try {
    if (-not (Test-Path (Join-Path $PSLRoot 'dist\index.html'))) {
        throw 'The compiled editor is missing. Extract the complete ZIP before starting.'
    }
    if ($VenvPython -and (Test-Path $VenvPython)) {
        & $VenvPython $Bootstrap --quick-check
        if ($LASTEXITCODE -eq 0) {
            & $VenvPython $Bootstrap @LaunchArguments
            exit $LASTEXITCODE
        }
    }
    if ($LaunchArguments -contains '--offline') { $env:UV_OFFLINE = '1' }
    if (-not (Test-Path $Uv)) {
        if ($env:UV_OFFLINE -eq '1') { throw 'The first installation needs Internet access; the local installer is not installed yet.' }
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        New-Item -ItemType Directory -Force -Path $UvDirectory | Out-Null
        $Installer = Join-Path $PSLRoot '.runtime\uv-installer.ps1'
        Write-Host 'PlotStatLab: downloading the official local runtime installer...'
        Invoke-WebRequest -UseBasicParsing -Uri "https://releases.astral.sh/github/uv/releases/download/$UvVersion/uv-installer.ps1" -OutFile $Installer
        $env:UV_UNMANAGED_INSTALL = $UvDirectory
        & $Installer
        if (-not (Test-Path $Uv)) { throw 'The local uv installer could not be installed.' }
    }
    & $Uv python install 3.12 --no-bin --no-registry
    if ($LASTEXITCODE -ne 0) { throw 'The local Python runtime could not be installed.' }
    $Python = (& $Uv python find --managed-python 3.12 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Python)) { throw 'The local Python runtime was not found.' }
    & $Python $Bootstrap --uv $Uv @LaunchArguments
    exit $LASTEXITCODE
} catch {
    Write-Host ('PlotStatLab: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Check your Internet connection and extract the ZIP into a folder you can write to.'
    exit 1
}
