# SenseIQ — Business Product Document

## 1. Product Overview

**SenseIQ** is a market intelligence platform by IQlytics Solutions Pvt Ltd that transforms raw field conversations between sales representatives and retail partners into structured, actionable business insights. It uses LLM-powered analysis to convert unstructured text (transcripts, survey responses, voice notes) into an interactive dashboard with 4 tabs, scores, revenue strategies, risk flags, and a persistent AI chat sidebar for natural language querying.

**Tagline:** *Own the Narrative of Your Market*

**Target Users:**
- FMCG sales managers and regional heads
- Field intelligence teams
- Revenue operations leaders
- Market research analysts

**Core Problem:** Field teams capture rich market intelligence through daily conversations with retailers, but this data is trapped in unstructured text/audio. SenseIQ extracts, categorizes, and scores this intelligence automatically, turning raw dialogue into a competitive advantage.

---

## 2. Value Proposition

| For | Value |
|---|---|
| **Sales Managers** | Instant visibility into retailer sentiment, demand signals, and competitive threats across their territory |
| **Revenue Teams** | Structured revenue maps: what to protect, upsell, cross-sell, and fix |
| **Market Research** | Auto-discovered themes, cause-effect mappings, and hidden signals from unstructured conversations |
| **Leadership** | Executive summaries and KPIs from field-level conversations without manual synthesis |

---

## 3. Input Modes

| Mode | Description | Status |
|---|---|---|
| **Text Transcripts** | Upload .txt, .csv, .md, .log, .tsv files containing conversation transcripts | Live |
| **Word Documents** | Upload .doc, .docx files — auto-extracted to text | Live |
| **Voice Notes** | Paste auto-transcribed speech from Whisper, Google STT, or similar | Ready (external STT) |
| **Survey Data** | Structured inputs merged with conversation text | Ready |
| **Image Attachments** | Photos of shelves, displays, competitor setups with context annotations | Phase 2 |

**Supported Languages:** Hindi, Hinglish, English (optimized for Indian FMCG field conversations)

---

## 4. Analysis Output

The AI engine produces 20+ structured insight fields per conversation:

### 4.1 Executive Summary
One-line narrative capturing the core market story from the conversation.

### 4.2 Retailer Profile
- Retailer name, sales rep name
- Shop type (Kirana, Pharmacy, General Store, etc.)
- Relationship tenure (long-term, new, unknown)

### 4.3 Sentiment Analysis
- **Overall sentiment:** 0-10 score with positive/mixed/negative label
- **4-axis breakdown:** Towards products, company support, market conditions, competition
- **Nuance explanation:** Why this sentiment was assigned

### 4.4 Auto-Discovered Themes
AI categorizes the conversation into business themes, each with:
- Theme name and description
- 0-10 intensity score
- Sentiment label (positive/mixed/negative)
- Severity rating (critical/high/medium/low)
- Evidence quote from the conversation

### 4.5 Business Metrics (8 KPIs)
| Metric | Measures | Scale |
|---|---|---|
| Sentiment | Overall conversation tone | 0-10 |
| Demand Index | Product pull, repeat orders, stock urgency | 0-10 |
| Margin Stress | Pricing complaints, discount pressure | 0-10 |
| Supply Risk | Delivery delays, stockouts, distributor gaps | 0-10 |
| Retailer Advocacy | Trust, relationship strength, willingness to push | 0-10 |
| Price Sensitivity | Customer bargaining, comparison behavior | 0-10 |
| Channel Shift | Online migration, supermarket preference | 0-10 |
| Brand Loyalty | Repeat preference, substitution resistance | 0-10 |

### 4.6 Revenue Strategy Map
Six-category action framework:
- **Must Sell** — Protect existing revenue
- **Upsell** — Expand wallet share
- **Cross Sell** — Introduce complementary products
- **Pain Points** — Revenue blockers to resolve
- **Improve Strategy** — Systemic changes for growth
- **Rethink Approach** — Structural market shifts requiring new strategies

Revenue map only displays when confidence ≥ 30%.

### 4.7 Risk Flags
Each risk includes:
- Description, severity (critical/high/medium/low)
- Risk type (churn, revenue_loss, operational, competitive, relational)
- Conditional flag with trigger condition

### 4.8 Opportunities
- Description, potential (high/medium/low)
- Requirements, quick-win flag

### 4.9 Product Insights
Per-product analysis:
- Performance rating (very_strong → weak)
- Demand level (Very High → Low)
- Substitution risk (Very Low → High)
- Feedback summary

### 4.10 Competitive Intelligence
- Competitor/channel name
- Threat type (pricing, availability, promotions, visibility, customer_behavior)
- Customer behavior shift detection

### 4.11 Action Items
- Specific action, owner, urgency (immediate/short_term/long_term)

### 4.12 Key Phrases
10-20 extracted quotes ranked by business significance (0-10 score) with auto-assigned tags and context.

### 4.13 Cause-Effect Mappings
Root issue → business impact with supporting evidence from the conversation.

### 4.14 Auto-Generated Q&A
Pre-generated question-answer pairs displayed in the chat sidebar for quick exploration.

---

## 5. Dashboard Experience

### 5.1 Layout

The dashboard uses a two-column layout:
- **Left side:** Tabbed content area with shared filter bar
- **Right side:** Persistent "Ask AI" chat sidebar (always visible)

### 5.2 Shared Filter Bar

Visible above all tabs for filtering by:
- Retailer
- Sales Rep
- Product
- Region
- Date Range

### 5.3 Four Tabs

| Tab | Content |
|---|---|
| **Overview** | Business Metrics (8 KPIs including Sentiment), sentiment meter with 4-axis breakdown, category scores |
| **Revenue Recommendation** | 6-category revenue strategy map, risk flags with severity color-coding |
| **Product Insights** | Product analysis, cause-effect mapping, decision insights, pain points, opportunities, competitive intel, action items |
| **Key Phrases** | Tag cloud with interactive filtering, phrase table with significance scores and context |

### 5.4 Persistent Chat Sidebar (Ask AI)

A fixed right-side chat panel (520px wide) that persists across all tabs:
- **Preset questions** — clickable suggestion buttons from auto-generated Q&A
- **Chat messages** — scrollable conversation history with user/AI bubbles
- **Auto-generated Q&A** — pre-built Q&A pairs shown on load
- **Text input** — ask any question about the analyzed conversation
- Responses are rendered in Markdown format

### 5.5 Session Management
- Sidebar with session history (persisted in localStorage)
- Click to switch between past analyses
- "New Analysis" button returns to upload page
- "Clear All" removes cached sessions

---

## 6. Scoring Interpretation Guide

### 0-10 Theme/Metric Scale
| Range | Meaning |
|---|---|
| 0-2 | Negligible — not mentioned or no signal |
| 3-4 | Weak — occasional mentions, light signals |
| 5-6 | Moderate — notable but not dominant |
| 7-8 | Strong — recurring theme with clear impact |
| 9-10 | Critical — dominant theme, major business factor |

### Sentiment Scale
| Value | Label |
|---|---|
| 0.0 | Negative |
| 0.3 | Mixed-Negative |
| 0.5 | Mixed |
| 0.7 | Mixed-Positive |
| 1.0 | Positive |

### Severity Levels
- **Critical** — Immediate attention required
- **High** — Significant impact, address soon
- **Medium** — Notable, monitor and plan
- **Low** — Background signal, track over time

### Action Urgency
- **Immediate** — 24-48 hours
- **Short Term** — 1-2 weeks
- **Long Term** — 1-3 months

---

## 7. Supported AI Models

| Model | Type | Best For |
|---|---|---|
| Gemma 4 31B Cloud | Cloud API | Default — balance of speed and depth |
| Gemma 3 27B Cloud | Cloud API | Cost-effective cloud analysis |

Any Ollama-compatible model that supports JSON structured output can be used by configuring a custom Ollama host.

---

## 8. Product Roadmap

### Phase 1 — Current (v4.0)
- LLM-powered analysis with structured JSON output
- 4-tab dashboard with persistent AI chat sidebar
- Multi-model support
- Revenue strategy categorization
- Key phrase table with interactive tag cloud filtering
- Natural language Q&A with vector-backed retrieval
- Multi-file upload support
- Shared filter bar across all tabs
- Voice transcript ready, survey data integration ready

### Phase 2 — Next
- Voice recording upload (audio → text via Whisper/Google STT)
- Image attachment processing
- Multi-transcript aggregation (regional trends, time-series)
- Real-time alerting
- User authentication & multi-tenancy
- CSV/PDF export

### Phase 3 — Future
- Embedding-based auto theme discovery
- Predictive analytics (churn forecasting, demand prediction)
- API marketplace for integrations
- White-label enterprise deployment
