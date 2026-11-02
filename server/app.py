"""Local-only HTTP service. Start with uvicorn server.app:app --host 127.0.0.1 --port 8765."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import scipy
from .outliers import detect_outliers

from .statistics import AnalyzeRequest, SuggestRequest, analyze, suggest

app = FastAPI(title="PlotStatLab Statistics", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173", "http://localhost:4173"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.get("/api/health")
def health():
    return {"status": "ok", "engine": f"SciPy {scipy.__version__}", "version": "0.2.0", "application": "PlotStatLab", "projectSchemaVersions": [1]}


@app.post("/api/suggest")
def suggestions(request: SuggestRequest):
    return suggest(request)


@app.post("/api/analyze")
def analysis(request: AnalyzeRequest):
    try:
        return analyze(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

@app.post("/api/outliers")
def outlier_detection(request: dict):
    try:
        return detect_outliers(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

# Mount the production editor last so API routes keep their dedicated handlers.
from pathlib import Path
from fastapi.staticfiles import StaticFiles
_manuals = Path(__file__).resolve().parents[1] / "manuals"
if _manuals.is_dir():
    app.mount("/manuals", StaticFiles(directory=str(_manuals), html=True), name="manuals")
_dist = Path(__file__).resolve().parents[1] / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="editor")
