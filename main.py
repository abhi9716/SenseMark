import asyncio
import os
import subprocess
from pathlib import Path
from io import BytesIO
from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from services.analyzer import analyze_text, analyze_with_query
from services import vector_db

env_path = Path(__file__).parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())

app = FastAPI(
    title="SenseMark Market Intelligence Platform",
    description="Real-time market feedback analysis from field teams — voice, surveys, and text transcripts transformed into actionable business intelligence using LLM-powered analysis",
    version="4.0.0",
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

SUPPORTED_ENCODINGS = ["utf-8", "latin-1", "cp1252", "iso-8859-1"]


def read_text_file(file: UploadFile) -> str:
    for encoding in SUPPORTED_ENCODINGS:
        try:
            raw = file.file.read()
            return raw.decode(encoding)
        except (UnicodeDecodeError, AttributeError):
            file.file.seek(0)
            continue
    raise HTTPException(status_code=400, detail="Unable to decode file. Please ensure it is a valid text file.")


def read_docx_file(file: UploadFile) -> str:
    try:
        from docx import Document
        doc = Document(BytesIO(file.file.read()))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read .docx file: {str(e)}")


def read_doc_file(file: UploadFile) -> str:
    raw = file.file.read()
    tmp_path = Path(f"/tmp/opencode/upload_{os.getpid()}.doc")

    try:
        tmp_path.write_bytes(raw)

        try:
            result = subprocess.run(
                ["antiword", "-m", "UTF-8", str(tmp_path)],
                capture_output=True, text=True, timeout=15,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

        try:
            subprocess.run(
                ["libreoffice", "--headless", "--convert-to", "txt", "--outdir", "/tmp/opencode", str(tmp_path)],
                capture_output=True, text=True, timeout=30,
            )
            txt_path = tmp_path.with_suffix(".txt")
            if txt_path.exists():
                content = txt_path.read_text(encoding="utf-8", errors="replace")
                txt_path.unlink(missing_ok=True)
                if content.strip():
                    return content.strip()
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

        raise HTTPException(
            status_code=400,
            detail="Cannot convert .doc file. Install 'antiword' (apt install antiword) or 'libreoffice' to process legacy .doc files. Alternatively, save as .docx or plain text.",
        )
    finally:
        tmp_path.unlink(missing_ok=True)


def read_file_content(file: UploadFile) -> str:
    _, ext = os.path.splitext(file.filename.lower())

    if ext == ".docx":
        return read_docx_file(file)
    elif ext == ".doc":
        return read_doc_file(file)
    else:
        return read_text_file(file)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...), model: str = Form(default="gemma4:31b-cloud")):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    allowed_extensions = {".txt", ".csv", ".md", ".log", ".tsv", ".doc", ".docx"}
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(allowed_extensions))}",
        )

    try:
        content = read_file_content(file)
    except HTTPException:
        raise

    if len(content.strip()) < 20:
        raise HTTPException(status_code=400, detail="File content is too short for meaningful analysis")

    collection_id = vector_db.get_collection_id(file.filename)
    vector_db.store_document(collection_id, content, file.filename)

    result = await analyze_text(content, model=model)

    if isinstance(result, dict) and result.get("error"):
        return {"filename": file.filename, "analysis": result, "collection_id": collection_id}

    result["collection_id"] = collection_id
    return {"filename": file.filename, "analysis": result, "collection_id": collection_id}


@app.post("/api/query")
async def query_analysis(request: Request):
    try:
        body = await request.json()
        collection_id = body.get("collection_id", "")
        text = body.get("text", "")
        query = body.get("query", "")
        model = body.get("model", "gemma4:31b-cloud")

        if not query.strip():
            raise HTTPException(status_code=400, detail="No query provided")

        if collection_id:
            relevant_context = vector_db.query_document(collection_id, query, n_results=8)
            if not relevant_context:
                return {"query": query, "answer": "Could not find relevant information in the transcript."}
            result = await analyze_with_query(relevant_context, query, model=model)
        elif text:
            result = await analyze_with_query(text, query, model=model)
        else:
            raise HTTPException(status_code=400, detail="No collection ID or text provided")
        return {"query": query, "answer": result}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Query error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clear-vector-db")
async def clear_vector_db(request: Request):
    try:
        body = await request.json()
        collection_id = body.get("collection_id", "")
        if collection_id:
            vector_db.delete_collection(collection_id)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
