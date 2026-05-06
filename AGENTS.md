# SenseMark (IQlytics) — Agent Guide

## Commands

```bash
# Setup (once)
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Run dev server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

No test runner, linter, type checker, or CI exists. Do not invent them.

## Architecture

Single FastAPI app (`main.py`) with two services:
- `services/analyzer.py` — Ollama LLM analysis (async, JSON-structured output)
- `services/vector_db.py` — ChromaDB persistent vector store at `.vector_db/`

Frontend: `templates/index.html` (Jinja2) + `static/` (CSS + JS).

## Env Loading

`.env` is parsed by **custom code in `main.py`** (lines 14-21), NOT python-dotenv. Keys are set via `os.environ.setdefault()`. Only `OLLAMA_HOST` and `OLLAMA_API_KEY` are used.

## LLM Models

Default model: `gemma4:31b-cloud`. Configurable per-request via the `model` form field.
Supports local Ollama (`http://localhost:11434`) or cloud/remote with API key.

## File Upload

Accepts `.txt`, `.csv`, `.md`, `.log`, `.tsv`, `.doc`, `.docx`.
- `.doc` requires `antiword` or `libreoffice` installed on the host (falls back with error message)
- Text files tried in encoding order: utf-8 → latin-1 → cp1252 → iso-8859-1
- Minimum content: 20 chars

## Vector DB

- ChromaDB persistent client, stored in `.vector_db/` at project root
- Collection IDs are MD5 hash prefixes (12 chars) of uploaded filenames
- Documents chunked at 500 chars with 100-char overlap, newline-aligned
- Cleared via `POST /api/clear-vector-db`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Dashboard UI |
| POST | `/api/analyze` | Upload file + optional `model` → LLM analysis + vector storage |
| POST | `/api/query` | NL question about transcript (uses vector DB or inline text) |
| POST | `/api/clear-vector-db` | Delete a vector collection |

## Gotchas

- `.env` contains a real API key — **never commit it**
- LLM responses are expected as raw JSON; analyzer strips markdown code fences before parsing
- `num_predict: 8000` on analysis calls — long transcripts may hit token limits
- No error logging beyond print statements; failures surface as HTTP 500 with stack traces to stdout
- Sessions persist client-side via `localStorage` (max 5, text stripped on save). Server has no session state.

## Reference Docs

| File | Content |
|------|---------|
| `docs/PRODUCT_DOC.md` | Business product doc — value prop, 20+ analysis fields, scoring guide, roadmap |
| `docs/HLD.md` | High-level design — architecture diagram, data flows, design decisions, deployment |
| `docs/LLD.md` | Low-level design — function-level specs for all Python/JS/CSS files |
