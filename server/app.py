"""Local-only HTTP service. Start with uvicorn server.app:app --host 127.0.0.1 --port 8765."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import scipy
import json
from pathlib import Path
APP_VERSION = json.loads((Path(__file__).resolve().parents[1] / "package.json").read_text(encoding="utf-8"))["version"]
from .outliers import detect_outliers
from .advanced import analyze_advanced

from .statistics import AnalyzeRequest, SuggestRequest, analyze, suggest

app = FastAPI(title="PlotStatLab Statistics", version=APP_VERSION)
@app.middleware("http")
async def local_resource_policy(request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173", "http://localhost:4173"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.get("/api/health")
def health():
    return {"status": "ok", "engine": f"SciPy {scipy.__version__}", "version": APP_VERSION, "application": "PlotStatLab", "projectSchemaVersions": [1]}


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

@app.post("/api/advanced")
def advanced_analysis(request: dict):
    try:
        return analyze_advanced(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

from .excel_import import import_excel
@app.post("/api/import/excel")
def import_workbook(request: dict):
    try:
        return import_excel(request.get("contentBase64"), request.get("filename", "Workbook.xlsx"))
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
