#!/bin/sh
# Local-only dependency bootstrap for macOS and Linux. No global PATH changes.
set -eu
PSL_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PSL_VENV=""
if [ -f "$PSL_ROOT/.runtime/active-python.txt" ]; then PSL_VENV=$(cat "$PSL_ROOT/.runtime/active-python.txt"); fi
PSL_UV_DIR="$PSL_ROOT/.runtime/uv"
PSL_UV="$PSL_UV_DIR/uv"
PSL_UV_VERSION=0.13.6
export UV_PYTHON_INSTALL_DIR="$PSL_ROOT/.runtime/python"
export UV_CACHE_DIR="$PSL_ROOT/.runtime/cache"
export UV_PYTHON_BIN_DIR="$PSL_ROOT/.runtime/python-bin"
export UV_NO_MODIFY_PATH=1
export UV_NO_PROGRESS=1

if [ ! -f "$PSL_ROOT/dist/index.html" ]; then
  printf '%s\n' 'PlotStatLab: the compiled editor is missing. Extract the complete ZIP before starting.' >&2
  exit 1
fi
# Every normal launch still visits bootstrap.py, which checks for PSL updates.
if [ -x "$PSL_VENV" ] && "$PSL_VENV" "$PSL_ROOT/scripts/bootstrap.py" --quick-check; then
  exec "$PSL_VENV" "$PSL_ROOT/scripts/bootstrap.py" "$@"
fi
for PSL_ARG in "$@"; do
  if [ "$PSL_ARG" = '--offline' ]; then export UV_OFFLINE=1; fi
done
if [ ! -x "$PSL_UV" ]; then
  if [ "${UV_OFFLINE:-0}" = '1' ]; then
    printf '%s\n' 'PlotStatLab: the first installation needs Internet access; the local installer is not installed yet.' >&2
    exit 1
  fi
  mkdir -p "$PSL_UV_DIR"
  PSL_INSTALLER="$PSL_ROOT/.runtime/uv-installer.sh"
  printf '%s\n' 'PlotStatLab: downloading the official local runtime installer...'
  curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error \
    "https://releases.astral.sh/github/uv/releases/download/$PSL_UV_VERSION/uv-installer.sh" \
    --output "$PSL_INSTALLER"
  UV_UNMANAGED_INSTALL="$PSL_UV_DIR" sh "$PSL_INSTALLER"
fi
if ! PSL_PYTHON=$("$PSL_UV" python find --managed-python 3.12 2>/dev/null); then
  "$PSL_UV" python install 3.12 --no-bin --no-registry
  PSL_PYTHON=$("$PSL_UV" python find --managed-python 3.12)
fi
exec "$PSL_PYTHON" "$PSL_ROOT/scripts/bootstrap.py" --uv "$PSL_UV" "$@"
