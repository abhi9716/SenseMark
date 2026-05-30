import asyncio
import json
import os
import csv
import subprocess
from pathlib import Path
from io import BytesIO

# Load .env before any imports that need env vars
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())

from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from services.analyzer import analyze_text, analyze_with_query, analyze_feedback_text
from services import vector_db

app = FastAPI(
    title="SenseMark Market Intelligence Platform",
    description="Real-time market feedback analysis from field teams — voice, surveys, and text transcripts transformed into actionable business intelligence using LLM-powered analysis",
    version="4.0.0",
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

DEFAULT_SESSION_CACHE = os.path.join(BASE_DIR, "static", "data", "default_session.json")


@app.on_event("startup")
async def warm_embedding_model():
    try:
        warmup = vector_db.client.get_or_create_collection("startup_warmup")
        warmup.upsert(documents=["server startup warmup"], ids=["w1"])
        warmup.query(query_texts=["warmup"], n_results=1)
        vector_db.client.delete_collection("startup_warmup")
        print("[startup] Embedding model loaded and resident")
    except Exception as e:
        print(f"[startup] Embedding warmup skipped (non-fatal): {e}")


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
async def analyze(file: UploadFile = File(...), model: str = Form(default="big-pickle")):
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
        model = body.get("model", "big-pickle")

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


@app.post("/api/analyze-feedback")
async def analyze_feedback(request: Request):
    try:
        body = await request.json()
        text = body.get("text", "")
        model = body.get("model", "big-pickle")

        if not text.strip():
            raise HTTPException(status_code=400, detail="No feedback text provided")

        result = await analyze_feedback_text(text, model=model)
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Feedback analysis error (non-fatal): {e}")
        return {
            "error": f"AI analysis unavailable: {str(e)}",
            "summary": "AI analysis is currently unavailable. The feedback dashboard works without it.",
            "sentiment": {"overall": "unknown", "score": 0.5, "nuance": "AI analysis unavailable"},
            "categories": [],
            "metrics": {},
            "revenue_map": {"relevant": False, "confidence": 0, "must_sell": [], "upsell": [], "cross_sell": [], "pain_points": [], "improve_strategy": []},
            "key_phrases": [],
            "risks": [],
            "opportunities": [],
            "insights": {"what_is_working": [], "what_is_breaking": [], "hidden_signals": []},
            "products": [],
            "action_items": [],
            "qa": [],
        }


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


@app.get("/api/default-session")
async def get_default_session():
    if not os.path.exists(DEFAULT_SESSION_CACHE):
        raise HTTPException(status_code=404, detail="Default sample analysis not available")
    try:
        with open(DEFAULT_SESSION_CACHE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=500, detail=f"Default sample file is corrupt: {e}")


CSV_DATA_PATH = os.path.join(BASE_DIR, "tbl_market_visit_feedback_answers.csv")
USERS_CSV_PATH = os.path.join(BASE_DIR, "tbl_market_visit_feedback_users.csv")
QUESTIONS_CSV_PATH = os.path.join(BASE_DIR, "tbl_market_visit_feedback_questions.csv")
OUTLETS_CSV_PATH = os.path.join(BASE_DIR, "tbl_market_visit_feedback_outlets.csv")

# Logged-in user for this single-tenant UAT build. Change this id (and the
# header/profile in templates/index.html) to view the dashboard as a
# different user.
CURRENT_USER_ID = int(os.environ.get("CURRENT_USER_ID", "9"))  # 9 = Kedar Lele

# Question ID -> level mapping aligned to the questions table channels:
#   Pharmacy Store / Grocery Store / MT Store / In-Market Activation / Dcommerce -> trade (retail-side)
#   HCP                                                                          -> hcp
#   Consumer / Consumer1                                                         -> consumer
QID_LEVEL_MAP = {}
for qid in range(1, 6):   QID_LEVEL_MAP[qid] = "trade"     # Pharmacy Store
for qid in range(8, 13):  QID_LEVEL_MAP[qid] = "trade"     # Grocery Store
for qid in range(15, 20): QID_LEVEL_MAP[qid] = "trade"     # MT Store
for qid in range(22, 29): QID_LEVEL_MAP[qid] = "trade"     # In-Market Activation
for qid in range(29, 34): QID_LEVEL_MAP[qid] = "hcp"       # HCP
for qid in range(36, 41): QID_LEVEL_MAP[qid] = "consumer"  # Consumer
for qid in range(43, 48): QID_LEVEL_MAP[qid] = "trade"     # Dcommerce (retail-side)
for qid in range(50, 55): QID_LEVEL_MAP[qid] = "consumer"  # Consumer1


def _parse_csv_rows(path):
    rows = []
    if not os.path.exists(path):
        return rows
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            cleaned = {}
            for k, v in r.items():
                if v == "" or v == "NULL" or v is None:
                    cleaned[k] = None
                else:
                    cleaned[k] = v
            rows.append(cleaned)
    return rows


def _load_all_answers():
    rows = []
    if not os.path.exists(CSV_DATA_PATH):
        return rows
    with open(CSV_DATA_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            row = {}
            for k, v in r.items():
                if v == "" or v == "NULL":
                    row[k] = None
                elif k in ("rating", "id", "visit_id", "user_id", "outlet_id", "question_id"):
                    try:
                        row[k] = int(float(v)) if v else None
                    except (ValueError, TypeError):
                        row[k] = None
                else:
                    row[k] = v
            row["level"] = QID_LEVEL_MAP.get(row.get("question_id")) if row.get("question_id") else None
            rows.append(row)
    return rows


@app.get("/api/feedback-data")
async def get_feedback_data():
    if not os.path.exists(CSV_DATA_PATH):
        raise HTTPException(status_code=404, detail="Feedback data CSV not found")
    try:
        all_rows = _load_all_answers()
        # Scope to logged-in user only
        rows = [r for r in all_rows if r.get("user_id") == CURRENT_USER_ID]
        return {"data": rows, "total": len(rows), "user_id": CURRENT_USER_ID}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/feedback-data-all")
async def get_feedback_data_all():
    """All-user feedback rows for the Group Feedback (across users) view."""
    if not os.path.exists(CSV_DATA_PATH):
        raise HTTPException(status_code=404, detail="Feedback data CSV not found")
    try:
        all_rows = _load_all_answers()
        return {"data": all_rows, "total": len(all_rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/feedback-meta")
async def get_feedback_meta():
    users_raw = _parse_csv_rows(USERS_CSV_PATH)
    questions_raw = _parse_csv_rows(QUESTIONS_CSV_PATH)
    outlets_raw = _parse_csv_rows(OUTLETS_CSV_PATH)

    users = []
    for u in users_raw:
        try:
            uid = int(u["id"]) if u.get("id") else None
        except (ValueError, TypeError):
            uid = None
        if uid is None:
            continue
        users.append({
            "id": uid,
            "user_name": u.get("user_name") or f"User #{uid}",
            "email": u.get("email"),
            "designation": u.get("designation"),
            "visit_type": u.get("visit_type"),
            "group": u.get("group") or None,
        })

    questions = []
    for q in questions_raw:
        try:
            qid = int(q["id"]) if q.get("id") else None
        except (ValueError, TypeError):
            qid = None
        if qid is None:
            continue
        questions.append({
            "id": qid,
            "channel": q.get("channel"),
            "channel_type": q.get("channel_type"),
            "question_no": q.get("question_no"),
            "question_text": q.get("question_text"),
            "answer_type": q.get("answer_type"),
        })

    outlets = []
    for o in outlets_raw:
        try:
            oid = int(o["id"]) if o.get("id") else None
        except (ValueError, TypeError):
            oid = None
        if oid is None:
            continue
        outlets.append({
            "id": oid,
            "outlet_code": o.get("outlet_code"),
            "outlet_name": o.get("outlet_name"),
            "owner_name": o.get("owner_name"),
            "mobile": o.get("mobile"),
            "channel": o.get("channel"),
            "channel_type": o.get("channel_type"),
            "address": o.get("address"),
            "city": o.get("city"),
            "state": o.get("state"),
        })

    me = next((u for u in users if u["id"] == CURRENT_USER_ID), None)
    return {
        "users": users,
        "questions": questions,
        "outlets": outlets,
        "current_user": me or {"id": CURRENT_USER_ID, "user_name": f"User #{CURRENT_USER_ID}"},
    }


@app.get("/api/visit/{visit_id}")
async def get_visit_detail(visit_id: int):
    all_rows = _load_all_answers()
    visit_rows = [r for r in all_rows if r.get("visit_id") == visit_id and r.get("user_id") == CURRENT_USER_ID]
    if not visit_rows:
        raise HTTPException(status_code=404, detail="Visit not found for current user")
    visit_rows.sort(key=lambda r: r.get("question_id") or 0)
    return {
        "visit_id": visit_id,
        "outlet_id": visit_rows[0].get("outlet_id"),
        "user_id": visit_rows[0].get("user_id"),
        "level": visit_rows[0].get("level"),
        "created_at": visit_rows[0].get("created_at"),
        "answers": visit_rows,
    }
