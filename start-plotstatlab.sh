#!/bin/sh
PSL_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$PSL_ROOT/scripts/bootstrap.sh" "$@"
