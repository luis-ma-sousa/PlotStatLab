"""Serve the prebuilt PSL editor locally and optionally open its browser tab."""
from __future__ import annotations
import argparse
import json
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORT = 8765
URL = f'http://127.0.0.1:{PORT}'


def existing(url: str | None = None) -> bool:
    url = url or URL
    try:
        with urllib.request.urlopen(url + '/api/health', timeout=1) as response:
            health = json.load(response)
            return health.get('application') == 'PlotStatLab' and health.get('status') == 'ok'
    except (OSError, ValueError, urllib.error.URLError):
        return False


def open_when_ready() -> None:
    for _ in range(100):
        if existing():
            webbrowser.open(URL)
            return
        time.sleep(.1)
    print('The server is taking longer to start. You can open ' + URL + ' manually.', flush=True)


def main(argv: list[str] | None = None) -> int:
    global PORT, URL
    parser = argparse.ArgumentParser(description='Open PlotStatLab locally.')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--port', type=int, default=8765, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if not 1024 <= args.port <= 65535:
        parser.error('port must be between 1024 and 65535')
    PORT = args.port
    URL = f'http://127.0.0.1:{PORT}'
    if not (ROOT / 'dist/index.html').is_file():
        print('The compiled editor is missing. Extract the complete PlotStatLab ZIP.', file=sys.stderr)
        return 1
    sys.path.insert(0, str(ROOT))
    if args.check:
        from server.app import app  # Import verifies runtime compatibility, without opening anything.
        print(f'PlotStatLab ready: {app.title}', flush=True)
        return 0
    if existing():
        print('PlotStatLab is already running at ' + URL, flush=True)
        if not args.no_browser:
            webbrowser.open(URL)
        return 0
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', PORT)) == 0:
            print(f'Port {PORT} is being used by another program. Close that program and start PlotStatLab again.', file=sys.stderr)
            return 1
    if not args.no_browser:
        threading.Thread(target=open_when_ready, daemon=True).start()
    print('PlotStatLab (PSL) · local editor at ' + URL + '\nKeep this window open. Press Ctrl+C to stop.', flush=True)
    import uvicorn
    uvicorn.run('server.app:app', host='127.0.0.1', port=PORT, log_level='warning')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
