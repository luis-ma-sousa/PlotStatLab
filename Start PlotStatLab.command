#!/bin/sh
PSL_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
sh "$PSL_ROOT/scripts/bootstrap.sh" "$@"
PSL_EXIT=$?
if [ "$PSL_EXIT" -ne 0 ]; then
  printf '\n%s\n' 'PlotStatLab could not start. The message above explains why.'
  printf '%s' 'Press Enter to close.'
  read PSL_ANSWER
fi
exit "$PSL_EXIT"
