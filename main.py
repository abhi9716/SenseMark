import asyncio
import json
import os
import csv
import secrets
import smtplib
import subprocess
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
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
                value = value.strip().strip('"').strip("'")
                os.environ.setdefault(key.strip(), value)

from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from services.analyzer import analyze_text, analyze_with_query, analyze_feedback_text
from services import vector_db
from services import db as mysql_db

app = FastAPI(
    title="SenseMark Market Intelligence Platform",
    description="Real-time market feedback analysis from field teams — voice, surveys, and text transcripts transformed into actionable business intelligence using LLM-powered analysis",
    version="4.0.0",
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SECRET_KEY    = os.environ.get("SECRET_KEY", "sensemark-uat-secret-change-in-prod")
ADMIN_EMAIL   = os.environ.get("ADMIN_EMAIL", "admin@sensemark.com")
SMTP_EMAIL    = os.environ.get("SMTP_EMAIL", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_HOST     = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT     = int(os.environ.get("SMTP_PORT", "587"))
OTP_EXPIRY    = 600   # seconds (10 min)
OTP_RESEND_COOLDOWN = 60   # seconds

app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY, session_cookie="sm_session", max_age=86400 * 7, https_only=False)

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


def _send_otp_email(to_email: str, otp: str, user_name: str = "") -> None:
    greeting = f"Hi {user_name}," if user_name else "Hello,"
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"{otp} is your Market Sense login code"
    msg["From"] = f"Market Sense <{SMTP_EMAIL}>"
    msg["To"] = to_email
    html = f"""
    <html><body style="margin:0;padding:0;background:#f0f2f8;font-family:'Segoe UI',sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
      <tr><td style="background:linear-gradient(135deg,#6c7cff,#a78bfa);padding:28px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">Market Sense</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px">IQlytics Solutions Pvt Ltd</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 8px;color:#333;font-size:15px">{greeting}</p>
        <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">Use the code below to sign in to your Market Sense dashboard. This code expires in <strong>10 minutes</strong>.</p>
        <div style="background:#f0f0ff;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#6c7cff">{otp}</span>
        </div>
        <p style="margin:0;color:#999;font-size:12px;line-height:1.6">If you did not request this code, you can safely ignore this email. Do not share this code with anyone.</p>
      </td></tr>
    </table>
    </td></tr></table>
    </body></html>
    """
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.sendmail(SMTP_EMAIL, to_email, msg.as_string())


_ADMIN_DESIGNATIONS = ("admin", "director", "head", "cxo", "ceo", "coo", "cto")
_MANAGER_DESIGNATIONS = ("manager", " tl", "team lead", "nsm", "zsm", "rsm", "asm", "lead", "supervisor")


def _resolve_role(designation: str) -> str:
    d = (designation or "").lower()
    if any(x in d for x in _ADMIN_DESIGNATIONS):
        return "admin"
    if any(x in d for x in _MANAGER_DESIGNATIONS):
        return "manager"
    return "rep"


def _get_session_user(request: Request) -> dict | None:
    return request.session.get("user")


def _require_auth(request: Request) -> dict:
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if request.session.get("user"):
        return RedirectResponse("/", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@app.get("/login/verify", response_class=HTMLResponse)
async def login_verify_page(request: Request):
    if request.session.get("user"):
        return RedirectResponse("/", status_code=302)
    if not request.session.get("otp_email"):
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse("login_verify.html", {
        "request": request,
        "email": request.session["otp_email"],
        "error": None,
    })


@app.post("/api/send-otp")
async def api_send_otp(request: Request, email: str = Form(...)):
    email = email.strip().lower()

    # Rate-limit resends
    last_sent = request.session.get("otp_sent_at", 0)
    if time.time() - last_sent < OTP_RESEND_COOLDOWN:
        remaining = int(OTP_RESEND_COOLDOWN - (time.time() - last_sent))
        return templates.TemplateResponse("login.html", {
            "request": request,
            "error": f"Please wait {remaining}s before requesting another code.",
        }, status_code=429)

    # Validate email exists
    is_admin = email == ADMIN_EMAIL.lower()
    user_name = "Admin"
    if not is_admin:
        try:
            users_raw = _db_load_users()
        except Exception:
            users_raw = _parse_csv_rows(USERS_CSV_PATH)
        matched = next((u for u in users_raw if str(u.get("email") or "").strip().lower() == email), None)
        if not matched:
            return templates.TemplateResponse("login.html", {
                "request": request,
                "error": "Email not registered. Please use your work email.",
            }, status_code=401)
        user_name = matched.get("user_name") or ""

    otp = str(secrets.randbelow(900000) + 100000)  # 6-digit, never starts with 0

    try:
        _send_otp_email(email, otp, user_name)
    except Exception as e:
        print(f"[SMTP] OTP send failed: {e}")
        return templates.TemplateResponse("login.html", {
            "request": request,
            "error": "Could not send code. Please try again.",
        }, status_code=500)

    request.session["otp_email"]    = email
    request.session["otp_code"]     = otp
    request.session["otp_expires"]  = time.time() + OTP_EXPIRY
    request.session["otp_sent_at"]  = time.time()
    request.session["otp_attempts"] = 0
    return RedirectResponse("/login/verify", status_code=302)


@app.post("/api/verify-otp")
async def api_verify_otp(request: Request, otp: str = Form(...)):
    otp_email  = request.session.get("otp_email")
    stored_otp = request.session.get("otp_code")
    expires    = request.session.get("otp_expires", 0)
    attempts   = request.session.get("otp_attempts", 0)

    def _otp_err(msg, status=401):
        return templates.TemplateResponse("login_verify.html", {
            "request": request, "email": otp_email, "error": msg,
        }, status_code=status)

    if not otp_email or not stored_otp:
        return RedirectResponse("/login", status_code=302)

    if time.time() > expires:
        request.session.clear()
        return templates.TemplateResponse("login.html", {
            "request": request,
            "error": "Code expired. Please request a new one.",
        }, status_code=401)

    if attempts >= 3:
        request.session.clear()
        return templates.TemplateResponse("login.html", {
            "request": request,
            "error": "Too many incorrect attempts. Please request a new code.",
        }, status_code=401)

    if otp.strip() != stored_otp:
        request.session["otp_attempts"] = attempts + 1
        left = 2 - attempts
        return _otp_err(f"Incorrect code. {left} attempt{'s' if left != 1 else ''} remaining.")

    # OTP valid — clear OTP state
    for k in ("otp_email", "otp_code", "otp_expires", "otp_sent_at", "otp_attempts"):
        request.session.pop(k, None)

    if otp_email == ADMIN_EMAIL.lower():
        request.session["user"] = {"id": 0, "user_name": "Admin", "designation": "Admin", "group": None, "role": "admin"}
        return RedirectResponse("/", status_code=302)

    try:
        users_raw = _db_load_users()
    except Exception:
        users_raw = _parse_csv_rows(USERS_CSV_PATH)

    matched = next((u for u in users_raw if str(u.get("email") or "").strip().lower() == otp_email), None)
    if not matched:
        return templates.TemplateResponse("login.html", {"request": request, "error": "User not found."}, status_code=401)

    try:
        uid = int(matched["id"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=500, detail="Invalid user record")

    role = _resolve_role(matched.get("designation"))
    request.session["user"] = {
        "id": uid,
        "user_name": matched.get("user_name") or f"User #{uid}",
        "designation": matched.get("designation"),
        "group": str(matched.get("group") or "").strip() or None,
        "role": role,
    }
    return RedirectResponse("/", status_code=302)


@app.post("/api/logout")
async def api_logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=302)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    session_user = request.session.get("user")
    if not session_user:
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse("index.html", {"request": request, "session_user": session_user})


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...), model: str = Form(default="big-pickle"), current_user: dict = Depends(_require_auth)):
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
async def query_analysis(request: Request, current_user: dict = Depends(_require_auth)):
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
async def analyze_feedback(request: Request, current_user: dict = Depends(_require_auth)):
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
async def clear_vector_db(request: Request, current_user: dict = Depends(_require_auth)):
    try:
        body = await request.json()
        collection_id = body.get("collection_id", "")
        if collection_id:
            vector_db.delete_collection(collection_id)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/default-session")
async def get_default_session(current_user: dict = Depends(_require_auth)):
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


# Question ID -> level mapping aligned to the questions table channels:
#   Pharmacy Store / Grocery Store / MT Store / In-Market Activation / Dcommerce -> trade (retail-side)
#   HCP                                                                          -> hcp
#   Consumer / Consumer1                                                         -> consumer
QID_LEVEL_MAP = {}
# Legacy question IDs (tbl_market_visit_feedback_questions, IDs 1-38)
for qid in range(1, 6):   QID_LEVEL_MAP[qid] = "trade"
for qid in range(8, 13):  QID_LEVEL_MAP[qid] = "trade"
for qid in range(15, 20): QID_LEVEL_MAP[qid] = "trade"
for qid in range(22, 29): QID_LEVEL_MAP[qid] = "trade"
for qid in range(29, 34): QID_LEVEL_MAP[qid] = "hcp"
for qid in range(36, 41): QID_LEVEL_MAP[qid] = "consumer"
for qid in range(43, 48): QID_LEVEL_MAP[qid] = "trade"
for qid in range(50, 55): QID_LEVEL_MAP[qid] = "consumer"
# New question IDs (tbl_market_visit_feedback_questions_29_05_2026, IDs 51-74)
for qid in range(51, 69): QID_LEVEL_MAP[qid] = "trade"     # Pharmacy/Grocery/MT/Activation/Dcommerce/Consumer1
for qid in range(69, 72): QID_LEVEL_MAP[qid] = "hcp"       # HCP
for qid in range(72, 75): QID_LEVEL_MAP[qid] = "consumer"  # Consumer


# ---- DB-backed loaders (fall back to CSV on any error) ----

_CHANNEL_TYPE_LEVEL = {'trade': 'trade', 'hcp': 'hcp', 'consumer': 'consumer'}


def _db_load_answers():
    rows_raw = mysql_db.query("""
        SELECT a.id, a.visit_id, a.user_id, a.outlet_id, a.visit_type, a.question_id,
               a.rating, a.answer_text, a.answer_number, a.created_at, a.status,
               a.voice_text, a.image_path, a.video_path, a.audio_path,
               LOWER(COALESCE(q.channel_type, '')) AS _q_level
        FROM tbl_market_visit_feedback_answers a
        LEFT JOIN tbl_market_visit_feedback_questions_29_05_2026 q ON a.question_id = q.id
        WHERE a.status = 'submitted'
        ORDER BY a.created_at
    """)
    rows = []
    for r in rows_raw:
        row = dict(r)
        q_level_raw = row.pop('_q_level', '') or ''
        for k in ("id", "visit_id", "user_id", "outlet_id", "question_id", "rating", "answer_number"):
            if row.get(k) is not None:
                try:
                    row[k] = int(row[k])
                except (ValueError, TypeError):
                    row[k] = None
        row["level"] = _CHANNEL_TYPE_LEVEL.get(q_level_raw) or QID_LEVEL_MAP.get(row.get("question_id"))
        rows.append(row)
    return rows


def _db_load_users():
    return mysql_db.query("""
        SELECT id, user_name, mobile_number, email, employee_code, designation,
               visit_type, store_name, outlet_id, city, state, `group`,
               created_at, updated_at
        FROM tbl_market_visit_feedback_users
    """)


def _db_load_questions():
    return mysql_db.query("""
        SELECT id, channel, channel_type, question_no, question_text, answer_type, 1 AS is_current
        FROM tbl_market_visit_feedback_questions_29_05_2026
    """)


def _db_load_outlets():
    return mysql_db.query("""
        SELECT id, outlet_code, outlet_name, owner_name,
               mobile_number AS mobile,
               channel, channel_option AS channel_type,
               address, city, state
        FROM tbl_market_visit_feedback_outlets
    """)


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
    try:
        return _db_load_answers()
    except Exception as e:
        print(f"[DB] answers: falling back to CSV ({e})")
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
async def get_feedback_data(request: Request, user_id: int | None = None, current_user: dict = Depends(_require_auth)):
    try:
        all_rows = _load_all_answers()
        role = current_user["role"]
        my_id = current_user["id"]

        if role == "admin":
            if user_id is not None:
                rows = [r for r in all_rows if r.get("user_id") == user_id]
                return {"data": rows, "total": len(rows), "user_id": user_id}
            else:
                return {"data": all_rows, "total": len(all_rows), "user_id": None}
        elif role == "manager":
            target_id = user_id if user_id is not None else my_id
        else:
            target_id = my_id

        rows = [r for r in all_rows if r.get("user_id") == target_id]
        return {"data": rows, "total": len(rows), "user_id": target_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/feedback-data-all")
async def get_feedback_data_all(current_user: dict = Depends(_require_auth)):
    """All-user feedback rows for the Overall Feedback (admin only)."""
    if current_user["role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        all_rows = _load_all_answers()
        return {"data": all_rows, "total": len(all_rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/feedback-data-group/{group_id}")
async def get_feedback_data_group(group_id: str, current_user: dict = Depends(_require_auth)):
    """Feedback rows scoped to users belonging to a specific group."""
    role = current_user["role"]
    user_group = current_user.get("group")
    if role == "rep" and not user_group:
        raise HTTPException(status_code=403, detail="Access denied")
    if role in ("rep", "manager") and user_group != group_id:
        raise HTTPException(status_code=403, detail="Access denied to this group")
    try:
        try:
            users_raw = _db_load_users()
        except Exception:
            users_raw = _parse_csv_rows(USERS_CSV_PATH)
        group_user_ids = set()
        for u in users_raw:
            g = str(u.get("group") or "").strip()
            if g == group_id:
                try:
                    uid = int(u["id"])
                    group_user_ids.add(uid)
                except (ValueError, TypeError):
                    pass
        all_rows = _load_all_answers()
        rows = [r for r in all_rows if r.get("user_id") in group_user_ids]
        return {"data": rows, "total": len(rows), "group_id": group_id, "user_ids": sorted(group_user_ids)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/feedback-meta")
async def get_feedback_meta(current_user: dict = Depends(_require_auth)):
    try:
        users_raw = _db_load_users()
    except Exception as e:
        print(f"[DB] users meta fallback to CSV: {e}")
        users_raw = _parse_csv_rows(USERS_CSV_PATH)
    try:
        questions_raw = _db_load_questions()
    except Exception as e:
        print(f"[DB] questions meta fallback to CSV: {e}")
        questions_raw = _parse_csv_rows(QUESTIONS_CSV_PATH)
    try:
        outlets_raw = _db_load_outlets()
    except Exception as e:
        print(f"[DB] outlets meta fallback to CSV: {e}")
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
            "is_current": int(q.get("is_current") or 0),
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

    session_uid = current_user["id"]
    role = current_user["role"]
    group = current_user.get("group")

    # Restrict user list to own group for managers; reps see only themselves
    if role == "manager" and group:
        users = [u for u in users if str(u.get("group") or "").strip() == group]
    elif role == "rep":
        users = [u for u in users if u["id"] == session_uid]

    me = next((u for u in users if u["id"] == session_uid), None)
    if me:
        me = dict(me)
        me["role"] = role
    else:
        me = {"id": session_uid, "user_name": current_user.get("user_name", f"User #{session_uid}"), "role": role}

    return {
        "users": users,
        "questions": questions,
        "outlets": outlets,
        "current_user": me,
    }


@app.get("/api/visit/{visit_id}")
async def get_visit_detail(visit_id: int, current_user: dict = Depends(_require_auth)):
    session_uid = current_user["id"]
    all_rows = _load_all_answers()
    visit_rows = [r for r in all_rows if r.get("visit_id") == visit_id and r.get("user_id") == session_uid]
    if not visit_rows:
        raise HTTPException(status_code=404, detail="Visit not found")
    visit_rows.sort(key=lambda r: r.get("question_id") or 0)
    return {
        "visit_id": visit_id,
        "outlet_id": visit_rows[0].get("outlet_id"),
        "user_id": visit_rows[0].get("user_id"),
        "level": visit_rows[0].get("level"),
        "created_at": visit_rows[0].get("created_at"),
        "answers": visit_rows,
    }
