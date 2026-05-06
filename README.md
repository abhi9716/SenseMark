# SenseMark — Market Intelligence Platform

**Real-time market feedback intelligence** — transforms voice notes, survey responses, and text transcripts from field teams into actionable business insights using LLM-powered analysis.

---

## Product Vision

Field teams capture market intelligence through **three modes**:

| Mode | Input | Processing |
|---|---|---|
| **Voice Notes** | Audio recordings of retailer conversations | Auto-transcribed via speech-to-text → full analysis pipeline |
| **Quick Surveys** | Structured inputs (ratings, checkboxes, dropdowns) | Merged with conversational data for enriched analysis |
| **Image Attachments** | Photos of shelves, displays, competitor setups | Context annotations attached to conversation transcripts |

SenseMark ingests all three modes, runs them through an **LLM analysis engine with vector-backed retrieval**, and delivers an **interactive dashboard** with scores, sentiment, business metrics, revenue strategy, insights, and natural language querying.

---

## Dashboard

### Overview Tab
- **Filter bar** — filter by retailer, sales rep, product, region, date range
- **Business Metrics** — sentiment, demand index, margin stress, supply risk, retailer advocacy, price sensitivity, channel shift, brand loyalty (all scored 0-10 with reasoning)
- **Sentiment Analysis** — overall score meter, nuance text, 4-axis breakdown
- **Category Scores** — auto-discovered business themes with bar charts, severity badges, and descriptions

### Revenue Tab
- **Revenue Strategy Map** — must-sell, upsell, cross-sell, pain points, improve strategy, rethink approach (shown when confidence ≥ 30%)
- **Risk Flags** — severity-tagged risks with conditional triggers

### Insights Tab
- **Product Insights** — per-product performance, demand level, substitution risk
- **Cause & Effect Mapping** — root cause → business impact with evidence
- **Decision Insights** — what's working / what's breaking / hidden signals
- **Pain Points & Opportunities** — impact-rated with suggested actions
- **Competitive Intelligence** — competitor threats with behavior shift detection
- **Action Items** — urgency-tagged checklist

### Key Phrases Tab
- **Interactive Tag Cloud** — click tags to filter the phrase table
- **Phrase Table** — scored, tagged, and contextual quotes from the conversation

### Ask AI Tab
- **Natural Language Query** — ask questions about the conversation (vector-backed via ChromaDB)
- **Auto-Generated Q&A** — pre-built questions for quick exploration

### Sidebar
- **Session Management** — switch between analyses, clear sessions
- **Persistent Cache** — sessions saved in localStorage (max 5, metadata only)

---

## Capability Matrix

### Multi-Mode Feedback Capture
- [x] **Text transcript upload** (.txt, .csv, .md, .log, .tsv) — drag & drop
- [x] **Word document upload** (.doc, .docx) — auto-extracted to text
- [x] **Voice notes ready** — paste auto-transcribed speech (Whisper, Google STT, etc.)
- [x] **Survey integration ready** — structured data merged with conversation text
- [x] **Multi-file upload** — analyze multiple transcripts in one session
- [ ] **Image attachments** — Phase 2: photos with context annotations

### AI Processing Layer
- [x] **LLM analysis engine** — structured JSON output with 20+ insight fields
- [x] **Sentiment analysis** — overall + 4-axis breakdown (products, company, market, competition)
- [x] **Auto-discovered themes** — AI categorizes conversation into business themes with severity
- [x] **Revenue strategy mapping** — must-sell, upsell, cross-sell, pain points, structural issues
- [x] **Natural language querying** — "Why are sales dropping in North?" → answered from transcript
- [x] **Vector-backed retrieval** — ChromaDB stores chunks for context-aware Q&A
- [x] **Root cause analysis** — cause-effect mapping from conversation
- [x] **Competitive intelligence** — competitor/channel threat detection
- [ ] **Trend detection across regions/time** — Phase 2: multi-transcript aggregation
- [ ] **Smart alerts** — Phase 2: threshold-based push/email notifications

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SenseMark                                    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Input Layer                                 │   │
│  │  Voice Notes (STT)  │  Quick Surveys  │  Image Context (TBD)  │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│                       Combined Text                                  │
│                             │                                       │
│  ┌──────────────────────────┼───────────────────────────────────┐   │
│  │              AI Analysis Engine                                │   │
│  │                                                              │   │
│  │  ┌──────────────────────┐  ┌──────────────────────────────┐  │   │
│  │  │  Ollama LLM Engine    │  │  ChromaDB Vector Store       │  │   │
│  │  │                      │  │                              │  │   │
│  │  │  • Structured JSON    │  │  • Persistent on disk        │  │   │
│  │  │  • 0-10 scoring       │  │  • 500-char chunked docs     │  │   │
│  │  │  • Cause-effect map   │  │  • Cosine similarity         │  │   │
│  │  │  • Revenue mapping    │  │  • Context-aware Q&A         │  │   │
│  │  │  • Competitive intel  │  │  • MD5-hashed collections    │  │   │
│  │  │  • Auto-tagging       │  │                              │  │   │
│  │  └──────────┬───────────┘  └──────────────┬───────────────┘  │   │
│  │             │                              │                 │   │
│  │             └──────────┬───────────────────┘                 │   │
│  │                        ▼                                     │   │
│  │            Combined JSON → Interactive Dashboard             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Dashboard                                        │   │
│  │  Overview │ Revenue │ Insights │ Key Phrases │ Ask AI         │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Supported AI Models

| Model | Type | Best For |
|---|---|---|
| **Gemma 4 31B Cloud** | Cloud API | Default — balance of speed and depth |
| **Gemma 3 27B Cloud** | Cloud API | Cost-effective cloud analysis |

Additional models can be used by configuring a custom Ollama host. Any Ollama-compatible model that supports JSON output will work.

---

## Quick Start

```bash
cd SenseMark

# Setup
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Configure Ollama (local or cloud)
cp .env.example .env  # edit with your settings

# Run
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Open http://localhost:8000
```

---

## Configuration

### Local Setup

Create a `.env` file in the project root:

```
OLLAMA_HOST=http://localhost:11434
OLLAMA_API_KEY=your-api-key-here
```

| Variable | Description | Default |
|---|---|---|
| `OLLAMA_HOST` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_API_KEY` | API key for cloud/remote Ollama | (empty) |

### Deploying to GitHub / Cloud Platforms

**Never commit `.env` to version control.** It is gitignored. Here's how to configure secrets for deployment:

#### GitHub (for GitHub Actions CI/CD)
1. Go to your repository → **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Add each variable individually:
   - Name: `OLLAMA_HOST`, Value: `http://localhost:11434`
   - Name: `OLLAMA_API_KEY`, Value: your actual key
4. Reference in your workflow: `${{ secrets.OLLAMA_HOST }}`

#### GitHub Codespaces
1. Go to repository → **Settings → Secrets and variables → Codespaces**
2. Add secrets the same way as Actions
3. They're auto-injected into `.env` when a codespace starts

#### Render / Railway / Fly.io / Heroku
Each platform has an "Environment Variables" section in the dashboard:
- **Render**: Service Settings → Environment → Add Environment Variable
- **Railway**: Variables tab → click "New Variable"
- **Fly.io**: `fly secrets set OLLAMA_HOST=... OLLAMA_API_KEY=...`
- **Heroku**: Settings → Config Vars → Reveal Config Vars → Add

#### Docker
```bash
docker run -d \
  -e OLLAMA_HOST=http://localhost:11434 \
  -e OLLAMA_API_KEY=your-key \
  -p 8000:8000 \
  sensmark:latest
```

#### Using a `.env.example` Template
This repo includes `.env.example` — copy it and fill in your values:
```bash
cp .env.example .env
# Edit .env with your actual values
```
The `.env` file is in `.gitignore` and will never be pushed.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Interactive dashboard UI |
| `POST` | `/api/analyze` | Upload file + optional `model` → LLM analysis |
| `POST` | `/api/query` | Natural language question about transcript (vector-backed) |
| `POST` | `/api/clear-vector-db` | Delete a vector collection by ID |

---

## Analysis Output Structure

The LLM returns structured JSON with 20+ fields including:

| Field | Description |
|---|---|
| `summary` | One-line executive summary |
| `retailer_profile` | Name, shop type, relationship tenure |
| `sentiment` | Overall score (0-10) + 4-axis breakdown with nuance |
| `categories` | Auto-discovered business themes (0-10 score, severity) |
| `metrics` | 7 business metrics: demand, margin, supply, advocacy, price, channel, loyalty |
| `revenue_map` | Must-sell, upsell, cross-sell, pain points, strategy |
| `key_phrases` | 10-20 tagged quotes ranked by significance |
| `risks` | Flagged risks with severity and conditions |
| `opportunities` | Detected opportunities with potential rating |
| `insights` | What's working / breaking / hidden signals |
| `products` | Per-product performance and substitution risk |
| `cause_effect` | Root cause → business impact mappings |
| `competitive_intel` | Competitor/channel threat detection |
| `action_items` | Specific actions with owner and urgency |
| `qa` | Auto-generated Q&A pairs |

**Scoring:** 0-10 scale (0-2: negligible, 3-4: weak, 5-6: moderate, 7-8: strong, 9-10: dominant)

---

## Project Structure

```
SenseMark/
├── main.py                         # FastAPI app + file readers + endpoints
├── services/
│   ├── analyzer.py                 # Ollama LLM analysis (async, JSON output)
│   └── vector_db.py                # ChromaDB persistent vector store
├── templates/
│   └── index.html                  # Dashboard (5 tabs + sidebar)
├── static/
│   ├── css/style.css               # Dashboard styles
│   └── js/app.js                   # Dashboard logic + session management
├── requirements.txt
├── .env.example                    # Ollama configuration template
├── .env                            # Local config (gitignored)
├── sample_conversation.txt         # Test data
├── BRD.md                          # Business Requirements Document
└── README.md
```

---

## Roadmap

### Phase 1 — Current (v4.0)
- [x] LLM-powered analysis with structured JSON output
- [x] Interactive dashboard with sidebar session management (5 tabs)
- [x] Multi-model support
- [x] Revenue strategy categorization
- [x] Interactive key phrase table with topic filtering
- [x] Natural language Q&A with vector-backed retrieval
- [x] Multi-file upload support
- [x] Voice transcript ready (accepts STT output)
- [x] Survey data integration ready

### Phase 2 — Next
- [ ] Voice recording upload (audio → text via Whisper/Google STT)
- [ ] Image attachment processing (context annotations)
- [ ] Multi-transcript aggregation (regional trends, time-series)
- [ ] Real-time alerting (threshold-based notifications)
- [ ] User authentication & multi-tenancy
- [ ] CSV/PDF export

### Phase 3 — Future
- [ ] Embedding-based auto theme discovery
- [ ] Predictive analytics (churn forecasting, demand prediction)
- [ ] API marketplace for integrations
- [ ] White-label enterprise deployment
