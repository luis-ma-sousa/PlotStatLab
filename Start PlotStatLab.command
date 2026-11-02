#!/bin/sh
PSL_FOLDER=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PSL_APP="$PSL_FOLDER/.psl"
if [ ! -f "$PSL_APP/scripts/bootstrap.sh" ]; then PSL_APP="$PSL_FOLDER"; fi
sh "$PSL_APP/scripts/bootstrap.sh" "$@"
PSL_EXIT=$?
if [ "$PSL_EXIT" -ne 0 ]; then
  printf '\n%s\n' 'PlotStatLab could not start. The message above explains why.'
  if [ -z "${CI:-}" ]; then printf '%s' 'Press Enter to close.'; read PSL_ANSWER; fi
fi
exit "$PSL_EXIT"
