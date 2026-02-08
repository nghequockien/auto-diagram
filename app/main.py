from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, Response, JSONResponse

from .diagram_renderer import render_diagram_png

app = FastAPI()

WEB_INDEX = Path(__file__).resolve().parents[1] / "web" / "index.html"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def index():
    return WEB_INDEX.read_text(encoding="utf-8")


@app.post("/render")
async def render(request: Request):
    try:
        spec = await request.json()
    except Exception as e:
        return JSONResponse({"error": f"Invalid JSON: {e}"}, status_code=400)

    try:
        png = render_diagram_png(spec)
        return Response(content=png, media_type="image/png")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)