"""Start one local production server and open the editor; no external data service."""
import json
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
PORT = 8765
URL = f"http://127.0.0.1:{PORT}"

def existing():
    try:
        with urllib.request.urlopen(URL + "/api/health", timeout=1) as response:
            return json.load(response).get("engine", "").startswith("SciPy")
    except Exception:
        return False

if not (ROOT / "dist" / "index.html").exists():
    sys.exit("Falta compilar a interface. Consulta README.md: pnpm build.")
if existing():
    webbrowser.open(URL)
    sys.exit(0)
with socket.socket() as probe:
    if probe.connect_ex(("127.0.0.1", PORT)) == 0:
        sys.exit(f"A porta {PORT} está ocupada por outro programa. Não foi alterado nenhum processo.")

def open_when_ready():
    for _ in range(100):
        if existing():
            webbrowser.open(URL)
            return
        time.sleep(.1)
threading.Thread(target=open_when_ready, daemon=True).start()
print("Prismatica · editor local em " + URL + "\nMantém esta janela aberta. Ctrl+C para terminar.", flush=True)
import uvicorn
uvicorn.run("server.app:app", host="127.0.0.1", port=PORT, log_level="warning")
