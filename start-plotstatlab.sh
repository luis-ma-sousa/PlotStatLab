#!/bin/sh
PSL_FOLDER=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PSL_APP="$PSL_FOLDER/.psl"
if [ ! -f "$PSL_APP/scripts/bootstrap.sh" ]; then PSL_APP="$PSL_FOLDER"; fi
exec sh "$PSL_APP/scripts/bootstrap.sh" "$@"
