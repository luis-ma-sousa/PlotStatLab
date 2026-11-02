#!/bin/zsh
PRISMATICA_DIR="${0:A:h}"
cd "$PRISMATICA_DIR" || exit 1
if [[ ! -x "$PRISMATICA_DIR/.venv/bin/python" ]]; then
  print 'Falta instalar o ambiente Python. Consulta README.md.'
  read '?Prima Enter para fechar.'
  exit 1
fi
"$PRISMATICA_DIR/.venv/bin/python" "$PRISMATICA_DIR/scripts/launch.py"
