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

SenseMark ingests all three modes, runs them through an **LLM analysis engine with vector-backed retrieval**, and delivers a **6-tab interactive dashboard** with scores, trends, alerts, and natural language querying.

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
│  │              Dashboard (6 Tabs)                               │   │
│  │  Overview │ Scores │ Revenue │ Insights │ Key Phrases │ Ask AI │   │
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
| `sentiment` | Overall + 4-axis breakdown with scores and nuance |
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
│   └── index.html                  # 6-tab dashboard (SenseMark branding)
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
- [x] 6-tab interactive dashboard with sidebar session management
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
