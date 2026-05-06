# SenseMark — High-Level Design (HLD)

## 1. System Overview

SenseMark is a single-server web application built with FastAPI that provides an AI-powered market intelligence dashboard. Users upload conversation transcripts or documents, which are processed by an Ollama LLM and stored in a vector database for contextual querying. The frontend is a single-page application served via Jinja2 templates with client-side state management.

**Architecture Pattern:** Monolithic web application with service-layer separation
**Version:** 4.0.0
**Primary Language:** Python 3.x
**Frontend:** HTML + CSS + Vanilla JavaScript

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Client Browser                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  index.html (Jinja2)  │  style.css  │  app.js  │  marked.js ││
│  └─────────────────────────────────────────────────────────────┘│
│         │  HTTP (REST)                                           │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Server (main.py)                       │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                    API Endpoints                           │   │
│  │  GET  /              → Dashboard UI                       │   │
│  │  POST /api/analyze   → File upload + LLM analysis          │   │
│  │  POST /api/query     → Natural language Q&A                │   │
│  │  POST /api/clear-vector-db → Delete vector collection      │   │
│  └───────────────────────────────────────────────────────────┘   │
│                           │                                       │
│  ┌────────────────────────┼──────────────────────────────────┐   │
│  │                    Service Layer                            │   │
│  │                                                             │   │
│  │  ┌──────────────────────┐  ┌────────────────────────────┐  │   │
│  │  │ services/analyzer.py │  │ services/vector_db.py      │  │   │
│  │  │                      │  │                            │  │   │
│  │  │ • analyze_text()     │  │ • store_document()         │  │   │
│  │  │ • analyze_with_query()│ │ • query_document()         │  │   │
│  │  │ • get_client()       │  │ • create_collection()      │  │   │
│  │  │                      │  │ • chunk_text()             │  │   │
│  │  │                      │  │ • delete_collection()      │  │   │
│  │  └──────────┬───────────┘  └────────────┬───────────────┘  │   │
│  └─────────────┼───────────────────────────┼──────────────────┘   │
│                │                           │                      │
└────────────────┼───────────────────────────┼──────────────────────┘
                 │                           │
                 ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────────────┐
│   Ollama API (External)   │  │  ChromaDB (.vector_db/)          │
│                           │  │                                 │
│  • LLM model inference    │  │  • Persistent vector store       │
│  • JSON structured output │  │  • Cosine similarity             │
│  • Local or cloud host    │  │  • MD5-hashed collections        │
└───────────────────────────┘  └─────────────────────────────────┘
```

---

## 3. Component Breakdown

### 3.1 Presentation Layer

| Component | File | Responsibility |
|---|---|---|
| Template | `templates/index.html` | Single-page layout: upload landing, loading overlay, 6-tab dashboard, sidebar, info panel |
| Styles | `static/css/style.css` | CSS custom properties, responsive grid layouts, animations, badge/tag styling |
| Logic | `static/js/app.js` | File upload/drag-drop, session management (localStorage), dashboard rendering, tab switching, AI query, tooltips |
| External | `marked.js` (CDN) | Markdown rendering for AI query responses |

### 3.2 Application Layer

| Component | File | Responsibility |
|---|---|---|
| Entry Point | `main.py` | FastAPI app definition, env loading, file readers, route handlers, static/templating mount |
| LLM Service | `services/analyzer.py` | Ollama async client, system prompt, text analysis, query-based analysis |
| Vector Service | `services/vector_db.py` | ChromaDB client, document chunking, storage, retrieval, collection management |

### 3.3 Data Layer

| Store | Type | Location | Purpose |
|---|---|---|---|
| ChromaDB | Persistent vector DB | `.vector_db/` (project root) | Store and query transcript chunks for contextual Q&A |
| localStorage | Browser storage | Client-side | Session history (metadata only, not full text) |
| `.env` | Config file | Project root | Ollama host and API key |

---

## 4. Data Flow

### 4.1 Analysis Flow

```
User uploads file
      │
      ▼
main.py: read_file_content() ──→ decode by extension
      │                              │
      │    .txt/.csv/.md/.log/.tsv ──→ try utf-8 → latin-1 → cp1252 → iso-8859-1
      │    .docx ────────────────────→ python-docx extraction
      │    .doc ─────────────────────→ antiword → fallback libreoffice
      ▼
Validate: ≥20 chars of content
      │
      ├───────────────────────────────────┐
      ▼                                   ▼
vector_db: store_document()        analyzer: analyze_text()
      │                                   │
  chunk_text(500/100 overlap)       ollama.AsyncClient.chat()
      │                                   │
  ChromaDB.add()                    SYSTEM_PROMPT + transcript
      │                                   │
  collection_id (MD5 prefix)        Parse JSON response
      │                                   │
      └──────────────┬────────────────────┘
                     ▼
            Return JSON to client
                     │
                     ▼
            app.js: addSession() → displayDashboard()
```

### 4.2 Query Flow

```
User enters question in "Ask AI" tab
      │
      ▼
app.js: fetch('/api/query')
      │
      ▼
main.py: /api/query handler
      │
      ├─ Has collection_id?
      │     │
      │     YES → vector_db.query_document(collection_id, query, n=8)
      │     │         │
      │     │     ChromaDB.query() → cosine similarity → top 8 chunks
      │     │         │
      │     │     Join chunks with "---" separator
      │     │
      │     NO → Use session.fileText (truncated to 200K chars)
      │
      ▼
analyzer: analyze_with_query(context, query)
      │
      ▼
ollama.AsyncClient.chat() → return answer text
      │
      ▼
app.js: marked.parse(answer) → render in query response div
```

---

## 5. Key Design Decisions

### 5.1 Custom `.env` Parser
`.env` is loaded by custom code in `main.py` (lines 14-21) using `os.environ.setdefault()`, NOT python-dotenv. Only `OLLAMA_HOST` and `OLLAMA_API_KEY` are consumed.

### 5.2 Collection ID Strategy
Vector collection IDs are 12-character MD5 hex prefixes of the uploaded filename. This provides:
- Deterministic mapping: same filename → same collection
- Collision resistance for practical use
- Short IDs for frontend storage

### 5.3 Document Chunking
Text is split at 500 characters with 100-character overlap, aligned to newline boundaries. Minimum chunk: 50 characters. This balances retrieval precision with context completeness.

### 5.4 Session Persistence
Sessions are stored in browser `localStorage` with text content stripped on save (only metadata persisted). Max 5 sessions kept when storage is full. This enables returning users to see past analyses without server-side state.

### 5.5 File Encoding Fallback
Text files are decoded in order: utf-8 → latin-1 → cp1252 → iso-8859-1. This handles mixed-encoding FMCG transcripts common in Indian field data.

### 5.6 .doc Conversion Chain
Legacy `.doc` files try `antiword` first (fast), then `libreoffice --headless` (fallback). Both must be installed on the host system.

### 5.7 LLM Response Parsing
The analyzer strips markdown JSON code fences (` ```json ` / ` ``` `) before parsing. If JSON parsing fails, returns an error dict with raw response rather than raising.

---

## 6. External Dependencies

| Dependency | Version | Purpose |
|---|---|---|
| fastapi | 0.115.6 | Web framework |
| uvicorn[standard] | 0.34.0 | ASGI server |
| ollama | 0.4.4 | Ollama Python client |
| python-multipart | 0.0.20 | File upload parsing |
| jinja2 | 3.1.5 | Template engine |
| pydantic | 2.10.4 | Data validation |
| python-docx | 1.1.2 | .docx file extraction |
| marked.js | CDN (latest) | Markdown rendering (frontend) |

### System Dependencies (for .doc support)
- `antiword` (preferred, `apt install antiword`)
- `libreoffice` (fallback)

---

## 7. Deployment Model

```
Development / Staging:
  ┌──────────────────┐
  │  uvicorn --reload │  (port 8000)
  │  Ollama local or  │
  │  cloud host       │
  │  ChromaDB local   │
  └──────────────────┘

Production (implied):
  ┌──────────────────┐
  │  uvicorn (gunicorn│  (reverse proxy)
  │  workers)         │
  │  Ollama cloud     │
  │  ChromaDB mounted │
  │  volume           │
  └──────────────────┘
```

No Docker, CI/CD, or production configuration exists in the repo currently.

---

## 8. Security Considerations

| Area | Current State | Note |
|---|---|---|
| Authentication | None | Single-user, no auth |
| API keys | Stored in `.env` | Must be gitignored |
| File uploads | Type-checked by extension | No content scanning |
| LLM input | Full transcript sent | No PII redaction |
| Vector DB | Local filesystem | No access controls |

---

## 9. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| LLM context limit | `num_predict: 8000` for analysis, `2000` for queries |
| Query text truncation | 200K characters (~50K tokens) |
| Minimum file content | 20 characters |
| Session storage | Browser localStorage, max ~5 sessions |
| Chunk size | 500 chars, 100 overlap |
| Supported encodings | utf-8, latin-1, cp1252, iso-8859-1 |
