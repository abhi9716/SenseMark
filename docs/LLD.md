# SenseMark — Low-Level Design (LLD)

## 1. `main.py` — FastAPI Application

### 1.1 Module Initialization

| Item | Detail |
|---|---|
| Lines | 1-31 |
| Imports | `asyncio`, `os`, `subprocess`, `pathlib.Path`, `io.BytesIO`, FastAPI classes, services |
| Env loading | Custom parser: opens `.env`, skips comments/blanks, splits on first `=`, uses `os.environ.setdefault()` |

### 1.2 App Configuration

```python
app = FastAPI(title="SenseMark Market Intelligence Platform", version="4.0.0")
```

- Static files mounted at `/static` from `static/` directory
- Jinja2 templates loaded from `templates/` directory
- `SUPPORTED_ENCODINGS = ["utf-8", "latin-1", "cp1252", "iso-8859-1"]`

### 1.3 File Reader Functions

#### `read_text_file(file: UploadFile) -> str`
- **Lines:** 36-44
- **Logic:** Iterates through `SUPPORTED_ENCODINGS`, tries `raw.decode(encoding)`, seeks back on failure
- **Error:** `HTTPException(400)` if all encodings fail

#### `read_docx_file(file: UploadFile) -> str`
- **Lines:** 47-54
- **Logic:** Uses `python-docx` `Document(BytesIO(...))`, extracts non-empty paragraph text, joins with newlines
- **Error:** `HTTPException(400)` with exception message on failure

#### `read_doc_file(file: UploadFile) -> str`
- **Lines:** 57-93
- **Logic:**
  1. Writes raw bytes to `/tmp/opencode/upload_{pid}.doc`
  2. Tries `antiword -m UTF-8` (15s timeout)
  3. Falls back to `libreoffice --headless --convert-to txt` (30s timeout, outputs to `/tmp/opencode`)
  4. Reads resulting `.txt`, cleans up temp files in `finally` block
- **Error:** `HTTPException(400)` with install instructions if both tools fail

#### `read_file_content(file: UploadFile) -> str`
- **Lines:** 96-104
- **Logic:** Routes by extension: `.docx` → `read_docx_file()`, `.doc` → `read_doc_file()`, else → `read_text_file()`

### 1.4 API Endpoints

#### `GET /` — Dashboard UI
- **Lines:** 107-109
- **Handler:** `index(request: Request)`
- **Returns:** `HTMLResponse` rendering `index.html`

#### `POST /api/analyze` — File Analysis
- **Lines:** 112-142
- **Parameters:** `file: UploadFile`, `model: str = "gemma4:31b-cloud"`
- **Flow:**
  1. Validates extension against `{.txt, .csv, .md, .log, .tsv, .doc, .docx}`
  2. Reads file content via `read_file_content()`
  3. Validates content length ≥ 20 chars
  4. Generates collection ID via `vector_db.get_collection_id(filename)`
  5. Stores document in vector DB via `vector_db.store_document()`
  6. Runs LLM analysis via `await analyze_text(content, model=model)`
  7. Attaches `collection_id` to result, returns JSON

#### `POST /api/query` — Natural Language Query
- **Lines:** 145-173
- **Body:** JSON with `collection_id`, `text`, `query`, `model`
- **Flow:**
  1. Validates `query` is non-empty
  2. If `collection_id` provided → `vector_db.query_document(collection_id, query, n_results=8)`
  3. If no collection but `text` provided → uses text directly (up to 200K chars handled by analyzer)
  4. Calls `await analyze_with_query(context, query, model=model)`
  5. Returns `{query, answer}` JSON

#### `POST /api/clear-vector-db` — Delete Collection
- **Lines:** 176-185
- **Body:** JSON with `collection_id`
- **Flow:** Calls `vector_db.delete_collection(collection_id)`, returns `{status: "ok"}`

---

## 2. `services/analyzer.py` — LLM Analysis Service

### 2.1 Module Configuration

| Item | Detail |
|---|---|
| Lines | 1-9 |
| Env vars | `OLLAMA_HOST` (default: `http://localhost:11434`), `OLLAMA_API_KEY` (default: `""`) |

### 2.2 `get_client() -> ollama.AsyncClient`
- **Lines:** 11-15
- **Logic:** Creates `ollama.AsyncClient(host=...)`, adds `Authorization: Bearer {key}` header if API key is set

### 2.3 `SYSTEM_PROMPT`
- **Lines:** 18-173
- **Purpose:** Defines the complete analysis schema as a JSON structure with 20+ fields
- **Key sections:**
  - Output structure (full JSON schema)
  - Scoring guidelines (0-10 scale definitions)
  - Revenue map relevance rules
  - Key phrase extraction rules (10-20 phrases, preserve original language)
  - Intensity signal table (Hindi/English phrase patterns with score impacts)

### 2.4 `analyze_text(text, model="gemma4:31b-cloud") -> dict`
- **Lines:** 176-217
- **Async:** Yes
- **Parameters:**
  - `text`: Full transcript string
  - `model`: Ollama model name
- **Chat options:**
  ```python
  temperature=0.3, num_predict=8000, top_p=0.9, format="json"
  ```
- **Flow:**
  1. Validates text non-empty
  2. Builds user prompt wrapping transcript
  3. Calls `get_client().chat()` with system prompt + user prompt
  4. Strips markdown code fences from response
  5. Parses JSON
  6. On `JSONDecodeError`: returns `{"error": ..., "raw_response": ...}`
  7. On other exception: raises `RuntimeError`

### 2.5 `analyze_with_query(text, query, model="gemma4:31b-cloud") -> str`
- **Lines:** 220-251
- **Async:** Yes
- **Parameters:**
  - `text`: Context (full text or retrieved chunks)
  - `query`: User's question
  - `model`: Ollama model name
- **Chat options:**
  ```python
  temperature=0.3, num_predict=2000
  ```
- **Flow:**
  1. Truncates text to 200K characters if longer
  2. Builds prompt with conversation + question
  3. Calls `get_client().chat()` with minimal system prompt
  4. Returns raw text content (not JSON)
  5. On exception: raises `RuntimeError`

---

## 3. `services/vector_db.py` — ChromaDB Vector Store

### 3.1 Module Initialization

| Item | Detail |
|---|---|
| Lines | 1-9 |
| Storage path | `services/../.vector_db/` (project root) |
| Client | `chromadb.PersistentClient(path=DB_PATH)` — created at import time |
| Directory | Auto-created via `os.makedirs(DB_PATH, exist_ok=True)` |

### 3.2 `get_collection_id(filename: str) -> str`
- **Lines:** 12-13
- **Logic:** `hashlib.md5(filename.encode()).hexdigest()[:12]`
- **Returns:** 12-character hex string

### 3.3 `create_collection(collection_id: str) -> chromadb.Collection`
- **Lines:** 16-23
- **Logic:**
  1. Tries `client.get_or_create_collection(name=..., metadata={"hnsw:space": "cosine"})`
  2. Falls back to `client.create_collection(name=...)` on exception

### 3.4 `get_collection(collection_id: str) -> Optional[chromadb.Collection]`
- **Lines:** 26-30
- **Logic:** `client.get_collection(name=...)`, returns `None` on exception

### 3.5 `delete_collection(collection_id: str)`
- **Lines:** 33-37
- **Logic:** `client.delete_collection(name=...)`, silently ignores exceptions

### 3.6 `chunk_text(text, chunk_size=500, overlap=100) -> list[str]`
- **Lines:** 40-56
- **Logic:**
  1. Starts at position 0, slices `chunk_size` characters
  2. If not at end, searches for newline in overlap zone (`end - overlap` to `end`)
  3. If newline found, ends chunk there (inclusive)
  4. Skips chunks shorter than 50 characters after strip
  5. Advances start by `max(1, end - overlap)` to maintain overlap
- **Edge case:** `max(start + 1, ...)` prevents infinite loop on empty chunks

### 3.7 `store_document(collection_id, text, filename) -> str`
- **Lines:** 59-79
- **Flow:**
  1. Gets/creates collection
  2. Chunks text via `chunk_text()`
  3. Generates IDs: `{collection_id}_chunk_{i}`
  4. Attaches metadata: `filename`, `chunk_index`, `total_chunks`
  5. Calls `collection.add(documents=..., ids=..., metadatas=...)`
  6. Returns `collection_id`

### 3.8 `query_document(collection_id, query, n_results=5) -> str`
- **Lines:** 82-96
- **Flow:**
  1. Gets collection (returns `""` if not found)
  2. Queries with `collection.query(query_texts=[query], n_results=min(n_results, collection.count()))`
  3. Joins returned documents with `"\n\n---\n\n"` separator
  4. Returns empty string if no results

---

## 4. `templates/index.html` — Frontend Template

### 4.1 Page Structure

```
<head>
  └─ title, favicon (iqlytics.in), stylesheet (/static/css/style.css)

<body>
  ├─ <header>          Logo + "SenseMark — Market Intelligence" badge
  │
  ├─ <section#uploadLanding>   Upload page (visible on load)
  │   ├─ Hero card: title + subtitle
  │   └─ Upload form:
  │       ├─ Drag-drop zone (accepts .txt,.csv,.md,.log,.tsv,.doc,.docx, multiple)
  │       ├─ File list (hidden until files selected)
  │       └─ Controls: model select + "Analyze Transcript" button
  │
  ├─ <div#loadingOverlay>      Loading overlay (hidden by default)
  │   └─ Spinner + 4 animated steps
  │
  ├─ <div#appLayout>           Dashboard (hidden by default)
  │   ├─ <aside#sidebar>       New Analysis + session list + Clear All
  │   └─ <main>
  │       └─ Dashboard with 6 tabs:
  │           ├─ Overview      Story banner, KPIs, profile, sentiment, metrics
  │           ├─ Scores        Category score bars, business metrics detail
  │           ├─ Revenue       Revenue strategy grid, risk flags
  │           ├─ Insights      Products, cause-effect, decisions, pain points, opportunities, competitive, actions
  │           ├─ Key Phrases   Topic filter + phrase table
  │           └─ Ask AI        Query presets, input, response, auto Q&A
  │
  ├─ <footer>                  "SenseMark — Market Intelligence Platform"
  │
  └─ <div#tooltipPopup>        Global tooltip element
```

### 4.2 External Dependencies
- `marked.js` from `cdn.jsdelivr.net` — Markdown parsing for AI query responses

---

## 5. `static/js/app.js` — Frontend Logic

### 5.1 State Management

| Variable | Type | Purpose |
|---|---|---|
| `sessions` | Array | All analysis sessions |
| `activeSessionId` | String | Currently displayed session |
| `pendingFiles` | Array | Files selected but not yet analyzed |
| `currentPhraseTag` | String | Active phrase filter tag |
| `STORAGE_KEY` | `"sensemark_sessions"` | localStorage key |

### 5.2 Session Functions

| Function | Purpose |
|---|---|
| `generateId()` | `Date.now().toString(36) + Math.random().toString(36).slice(2,8)` |
| `loadSessions()` | Parse from localStorage, validate array |
| `saveSessions()` | Serialize to localStorage (strips `fileText`), trim to last 5 if full |
| `clearAllSessions()` | Remove from localStorage, reset state |
| `addSession(filename, data, text, collectionId)` | Create session, push, save, render sidebar |
| `getSession(id)` | Find by id |
| `activateSession(id)` | Set active, render sidebar, display dashboard |
| `removeSession(id)` | Filter out, save, render sidebar, activate last or hide dashboard |

### 5.3 File Upload Flow

1. `handleFileSelect(files)` — deduplicates by name+size, adds to `pendingFiles`
2. `updateFileList()` — renders file list DOM, enables/disables analyze button
3. Form submit:
   - Iterates `pendingFiles` sequentially
   - Each file: `FormData` → `POST /api/analyze` → parse result
   - Reads file text via `FileReader.readAsText()`
   - `addSession()` with result data
   - On all success: `activateSession()` for last session
   - On any failure: shows error, aborts

### 5.4 Query Flow

1. User types question, clicks "Ask" or presses Enter
2. Gets active session, builds request:
   - If `collectionId` exists: `{collection_id, query, model}`
   - Else: `{text: fileText.slice(0, 200000), query, model}`
3. `POST /api/query` → parse response
4. Renders with `marked.parse()` if available, else raw text

### 5.5 Dashboard Rendering Functions

| Function | Renders |
|---|---|
| `displayDashboard(data)` | Orchestrates all tab rendering |
| `renderStoryBanner(summary)` | Overview banner with title + subtitle |
| `renderKPIs(metrics, sentiment, categories)` | 5 KPI cards: Demand, Sentiment, Margin Stress, Supply Risk, Advocacy |
| `renderProfile(profile)` | Retailer profile grid (hidden if all "Unknown") |
| `renderSentiment(sentiment)` | Sentiment meter, label, percentage, 4-axis breakdown badges |
| `renderMetrics(metrics)` | 7 metric cards with reasoning tooltips |
| `renderCategoryScores(categories)` | Score bars with progress tracks, sentiment + severity badges |
| `renderBusinessMetrics(metrics)` | Icon-based metric cards with color-coded scores |
| `renderRevenueMap(revenueMap)` | 6-category grid (hidden if confidence < 0.3) |
| `renderRisks(risks)` | Color-coded risk items with severity, type, condition |
| `renderProducts(products)` | Product cards with performance/demand/substitution tags |
| `renderCauseEffect(mappings)` | Cause → effect items with evidence quotes |
| `renderDecisionInsights(insights)` | Three sections: working/breaking/hidden signals |
| `renderPainPoints(items)` | Impact-coded pain point cards |
| `renderOpportunities(items)` | Potential-coded opportunity cards with quick-win badges |
| `renderCompetitiveIntelligence(items)` | Competitor cards with threat type and behavior shifts |
| `renderActionItems(items)` | Checklist with urgency badges |
| `renderAutoQAs(items)` | Q&A pairs |
| `renderQueryPresets(qaList)` | First 3 Q&A as clickable preset buttons |
| `renderKeyPhrases(phrases)` | Phrase table: text, score, color-coded tags, context |
| `renderPhrasesByTag(phrases, tag)` | Filtered phrase table |

### 5.6 Utility Functions

| Function | Purpose |
|---|---|
| `formatLabel(key)` | Converts `snake-case` or `snake_case` to `Title Case` |
| `goodColor(val)` | Green-high color: red→green gradient (higher = better) |
| `riskColor(val)` | Red-high color: green→red gradient (higher = worse) |
| `scoreGradient(ratio)` | Color for score bars |
| `sentimentGradient(ratio)` | Color for sentiment meter |
| `scoreTextColor(ratio)` | Always `#ffffff` |
| `showLoading()` / `hideLoading()` | Toggle loading overlay |
| `animateSteps()` | Animate 4 loading steps with 1s intervals |
| `resetSteps()` | Reset step indicators |
| `showError(message)` | Show red error banner |
| `updateInfoPanel(tab)` | Render contextual help panel per tab |

### 5.7 Tag Color Map

| Tag | Background | Text |
|---|---|---|
| demand, sentiment_positive | `#d1fae5` | `#059669` |
| pricing, margin, sentiment_negative | `#fee2e2` | `#dc2626` |
| supply | `#fef3c7` | `#d97706` |
| competition | `#fce7f3` | `#db2777` |
| quality | `#e0f2fe` | `#0284c7` |
| relationship, loyalty | `#ede9fe` | `#7c3aed` |
| schemes | `#ffedd5` | `#ea580c` |
| customer_behavior, general | `#f1f5f9` | `#475569` / `#64748b` |

### 5.8 Initialization

On `DOMContentLoaded`:
1. Cache all DOM element references
2. `renderSidebar()` (empty initially)
3. `loadSessions()` — if cached sessions exist, show dashboard with last session

---

## 6. `static/css/style.css` — Styles

### 6.1 CSS Custom Properties

| Category | Variables |
|---|---|
| Colors | `--primary`, `--success`, `--warning`, `--danger`, `--neutral`, `--info`, `--border`, `--surface`, `--background`, `--text` (with `-dark`, `-light`, `-50` variants) |
| Spacing | `--radius-xs` (4px), `--radius-sm` (6px), `--radius` (10px), `--radius-lg` (16px) |
| Shadows | `--shadow-xs` through `--shadow-xl` |
| Transitions | `--transition-fast` (0.15s), `--transition-base` (0.25s), `--transition-slow` (0.4s) |
| Status | `--color-critical/warning/good-{bg,text,border}` |

### 6.2 Key Layout Components

| Component | Layout |
|---|---|
| `.app-layout` | Flex row: sidebar (260px) + main (flex:1) |
| `.dashboard-layout` | Flex row: tab-content (flex:1) + info-panel (300px sticky) |
| `.dashboard-tabs` | Flex row with horizontal scroll, pill-style buttons |
| `.kpi-row` | CSS grid: `repeat(auto-fit, minmax(200px, 1fr))` |
| `.metrics-grid` | CSS grid: `repeat(auto-fit, minmax(220px, 1fr))` |
| `.revenue-grid` | CSS grid: `repeat(auto-fit, minmax(280px, 1fr))` |
| `.phrase-table` | Full-width table with horizontal scroll wrapper |

### 6.3 Animations

| Animation | Target | Effect |
|---|---|---|
| `fadeInUp` | Upload card, tab panes, query response | Opacity 0→1, translateY(16px→0) |
| `fadeIn` | App layout | Opacity 0→1 |
| `slideIn` | File items, session items | Opacity 0→1, translateX(-8px→0) |
| `spin` | Loading spinner | Rotate 0→360deg |
| `pulse` | Active step dot | Scale 1→1.2 with box-shadow ring |

---

## 7. `.env` Configuration

```
OLLAMA_HOST=http://localhost:11434    # or cloud URL
OLLAMA_API_KEY=<api-key-or-empty>     # Bearer token for cloud Ollama
```

Parsed by custom code in `main.py` — NOT python-dotenv.

---

## 8. File Type Support Matrix

| Extension | Reader | Encoding | External Dep |
|---|---|---|---|
| `.txt` | `read_text_file()` | utf-8 → latin-1 → cp1252 → iso-8859-1 | None |
| `.csv` | `read_text_file()` | utf-8 → latin-1 → cp1252 → iso-8859-1 | None |
| `.md` | `read_text_file()` | utf-8 → latin-1 → cp1252 → iso-8859-1 | None |
| `.log` | `read_text_file()` | utf-8 → latin-1 → cp1252 → iso-8859-1 | None |
| `.tsv` | `read_text_file()` | utf-8 → latin-1 → cp1252 → iso-8859-1 | None |
| `.docx` | `read_docx_file()` | N/A (python-docx) | None |
| `.doc` | `read_doc_file()` | N/A (antiword/libreoffice) | `antiword` or `libreoffice` |
