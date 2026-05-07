import httpx
import os
import json
import re
from typing import Optional

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "https://ollama.com")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")


async def ollama_chat(messages, model="gemma4:31b-cloud", options=None, format=None):
    headers = {"Content-Type": "application/json"}
    if OLLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {OLLAMA_API_KEY}"

    payload = {"model": model, "messages": messages, "stream": False}
    if options:
        payload["options"] = options
    if format:
        payload["format"] = format

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(f"{OLLAMA_HOST}/api/chat", headers=headers, json=payload)
        response.raise_for_status()
        return response.json()


SYSTEM_PROMPT = """You are an expert market research analyst specializing in FMCG field intelligence. Analyze conversations between sales reps and retail partners to extract structured, decision-grade insights.

## OUTPUT STRUCTURE — Return ONLY valid JSON. No markdown, no explanation.

{
  "summary": "One-line executive summary capturing the core narrative. If the conversation lacks sufficient information for a meaningful summary, provide a brief statement about the data quality or primary theme observed.",
  "retailer_profile": {
    "retailer_name": "Name or 'Unknown'",
    "rep_name": "Name or 'Unknown'",
    "shop_type": "Inferred (Kirana, Pharmacy, General Store, etc.)",
    "relationship_tenure": "Inferred (long-term, new, unknown)"
  },
  "sentiment": {
    "overall": "positive | mixed | negative",
    "score": 0.0 to 1.0,
    "nuance": "Brief explanation of why this sentiment was assigned",
    "breakdown": {
      "towards_products": "positive | mixed | negative",
      "towards_company_support": "positive | mixed | negative",
      "towards_market_conditions": "positive | mixed | negative",
      "towards_competition": "positive | mixed | negative"
    }
  },
  "categories": [
    {
      "name": "Auto-discovered business theme (e.g., 'Demand & Sales Velocity', 'Margin Pressure', 'Supply Chain Gaps')",
      "description": "What this category covers",
      "score": 0 to 10,
      "sentiment": "positive | mixed | negative",
      "evidence": "Direct quote or close paraphrase from conversation",
      "severity": "critical | high | medium | low"
    }
  ],
  "metrics": {
    "demand_index": {"value": 0 to 10, "reasoning": "Brief explanation"},
    "margin_stress": {"value": 0 to 10, "reasoning": "Brief explanation"},
    "supply_risk": {"value": 0 to 10, "reasoning": "Brief explanation"},
    "retailer_advocacy": {"value": 0 to 10, "reasoning": "Brief explanation"},
    "price_sensitivity": {"value": 0 to 10, "reasoning": "Brief explanation"},
    "channel_shift": {"value": 0 to 10, "reasoning": "Brief explanation"},
    "brand_loyalty": {"value": 0 to 10, "reasoning": "Brief explanation"}
  },
  "revenue_map": {
    "relevant": true if conversation has actionable revenue insights, false otherwise,
    "confidence": 0.0 to 1.0,
    "must_sell": ["Actions to protect existing revenue"],
    "upsell": ["Upsell opportunities"],
    "cross_sell": ["Cross-sell opportunities"],
    "pain_points": ["Revenue-blocking pain points"],
    "improve_strategy": ["Strategic improvements"],
    "think_over_selling": ["Structural issues requiring rethinking"]
  },
  "key_phrases": [
    {
      "text": "Original sentence/quote from the conversation (preserve original language)",
      "score": 0 to 10,
      "tags": ["auto-assigned tags like 'demand', 'pricing', 'competition', 'supply', 'sentiment-positive', etc."],
      "context": "Brief context about why this phrase matters"
    }
  ],
  "risks": [
    {
      "flag": "Description of risk",
      "severity": "critical | high | medium | low",
      "risk_type": "churn | revenue_loss | operational | competitive | relational",
      "is_conditional": true or false,
      "condition": "What triggers this risk, or empty string"
    }
  ],
  "opportunities": [
    {
      "opportunity": "Description",
      "potential": "high | medium | low",
      "requirements": "What is needed",
      "quick_win": true or false
    }
  ],
  "insights": {
    "what_is_working": ["What is going well with brief evidence"],
    "what_is_breaking": ["What is failing with brief evidence"],
    "hidden_signals": ["Non-obvious insights inferred from the conversation"]
  },
  "products": [
    {
      "name": "Product/brand name",
      "performance": "very_strong | strong | moderate | weak | unknown",
      "demand_level": "Very High | High | Medium | Low",
      "substitution_risk": "Very Low | Low | Medium | High",
      "feedback": "What was said"
    }
  ],
  "cause_effect": [
    {
      "cause": "Root issue",
      "effect": "Business impact",
      "evidence": "Quote linking cause to effect"
    }
  ],
  "competitive_intel": [
    {
      "competitor_or_channel": "Competitor name or channel",
      "threat_type": "pricing | availability | promotions | visibility | customer_behavior | other",
      "details": "What was mentioned",
      "customer_behavior_shift": "Any shift in customer behavior"
    }
  ],
  "action_items": [
    {
      "action": "Specific action",
      "owner": "Who should take it",
      "urgency": "immediate | short_term | long_term"
    }
  ],
  "qa": [
    {
      "question": "Why might sales be affected?",
      "answer": "Answer based on conversation"
    },
    {
      "question": "What is the retailer's biggest concern?",
      "answer": "Answer based on conversation"
    },
    {
      "question": "How is the relationship between company and retailer?",
      "answer": "Answer based on conversation"
    }
  ]
}

## SCORING GUIDELINES (0-10 scale)

- **0-2**: Not mentioned or negligible presence
- **3-4**: Weak signals, occasional mentions
- **5-6**: Moderate presence, notable but not dominant
- **7-8**: Strong signals, recurring theme with clear impact
- **9-10**: Dominant theme, critical business factor

## REVENUE MAP RELEVANCE

Set `revenue_map.relevant` to `false` if the conversation lacks actionable revenue signals. Only set `true` when there are clear revenue-related insights. Set `confidence` based on how much evidence supports each recommendation.

## KEY PHRASES

Extract 10-20 of the most meaningful sentences/phrases from the conversation. Preserve the original language (Hindi/Hinglish/English). Assign relevant tags and a 0-10 score based on business significance.

## INTENSITY SIGNALS

| Phrase Pattern | Score Impact |
|---|---|
| "कोई तोड़ नहीं" / "no substitute" | +3 to demand score |
| "सबसे बड़ी दिक्कत" / "biggest problem" | +3 to relevant issue score |
| "सोच-समझकर खरीदता है" / "buys after thinking" | +2 to price sensitivity |
| "तभी आता है जब इमरजेंसी" / "comes only in emergency" | +3 to channel shift |
| "अगर ध्यान रखेंगे तो पुश करेंगे" / "if you care, we'll push" | +1 to conditional risk |

Apply rigorously when assigning scores."""


async def analyze_text(text: str, model: str = "gemma4:31b-cloud") -> dict:
    if not text or not text.strip():
        raise ValueError("Input text cannot be empty")

    user_prompt = f"""Analyze the following market research conversation transcript between a sales representative and a retail partner:

---
{text}
---

Provide your analysis as valid JSON matching the specified structure."""

    try:
        response = await ollama_chat(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            options={
                "temperature": 0.3,
                "num_predict": 8000,
                "top_p": 0.9,
            },
            format="json",
        )

        content = response["message"]["content"].strip()
        content = re.sub(r'^```json\s*', '', content)
        content = re.sub(r'\s*```$', '', content)
        content = content.strip()

        result = json.loads(content)
        return result

    except json.JSONDecodeError as e:
        return {
            "error": f"Failed to parse LLM response as JSON: {str(e)}",
            "raw_response": content if 'content' in locals() else None,
        }
    except Exception as e:
        raise RuntimeError(f"Analysis failed: {str(e)}")


async def analyze_with_query(text: str, query: str, model: str = "gemma4:31b-cloud") -> str:
    # Truncate text to fit within model context window (~200K chars ≈ ~50K tokens)
    max_chars = 200000
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[...truncated for length...]"

    prompt = f"""You are analyzing a market research conversation. Based on the conversation below, answer the user's question.

Conversation:
---
{text}
---

Question: {query}

Provide a detailed, insightful answer based only on the information in the conversation. If the answer cannot be determined from the conversation, say so clearly."""

    try:
        response = await ollama_chat(
            model=model,
            messages=[
                {"role": "system", "content": "You are a market research analyst. Answer questions based only on the provided conversation transcript."},
                {"role": "user", "content": prompt},
            ],
            options={
                "temperature": 0.3,
                "num_predict": 2000,
            },
        )
        return response["message"]["content"]
    except Exception as e:
        raise RuntimeError(f"Query analysis failed: {str(e)}")
