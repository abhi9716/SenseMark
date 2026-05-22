import httpx
import os
import json
import re
from typing import Optional

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "https://ollama.com")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")

ZEN_API_URL = "https://opencode.ai/zen/v1/chat/completions"


async def zen_chat(messages, model="big-pickle", temperature=0.3, max_tokens=8000, top_p=0.9):
    api_key = os.getenv("opencode_api_key", "")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "top_p": top_p,
    }
    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(ZEN_API_URL, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


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


async def llm_chat(messages, model="big-pickle", temperature=0.3, max_tokens=8000, top_p=0.9):
    api_key = os.getenv("opencode_api_key", "")
    if api_key:
        return await zen_chat(messages, model=model, temperature=temperature, max_tokens=max_tokens, top_p=top_p)
    result = await ollama_chat(
        messages=messages,
        model=model,
        options={"temperature": temperature, "num_predict": max_tokens, "top_p": top_p},
    )
    return result["message"]["content"]


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


async def analyze_text(text: str, model: str = "big-pickle") -> dict:
    if not text or not text.strip():
        raise ValueError("Input text cannot be empty")

    user_prompt = f"""Analyze the following market research conversation transcript between a sales representative and a retail partner:

---
{text}
---

Provide your analysis as valid JSON matching the specified structure."""

    try:
        content = await llm_chat(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=8000,
            top_p=0.9,
        )

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
        return {"error": f"Analysis failed: {str(e)}"}


async def analyze_with_query(text: str, query: str, model: str = "big-pickle") -> str:
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
        content = await llm_chat(
            model=model,
            messages=[
                {"role": "system", "content": "You are a market research analyst. Answer questions based only on the provided conversation transcript."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=2000,
        )
        return content
    except Exception as e:
        return f"[Analysis unavailable: {str(e)}]"


FEEDBACK_PROMPT = """You are a customer feedback analyst. Analyze the following market feedback responses from FMCG field visits.

The data contains feedback across Trade (pharmacy/grocery/MT/activation/dcommerce), HCP (clinic/hospital), and Consumer (direct) levels.

Each entry has: rating (1-5), open-ended response text, outlet, channel, user, date.

Your task: extract structured business intelligence from the open-ended responses.

Return ONLY valid JSON. No markdown, no explanation.

{
  "summary": "Executive summary of key themes across all feedback responses",
  "sentiment": {
    "overall": "positive | mixed | negative",
    "score": 0.0 to 1.0,
    "nuance": "Brief explanation of overall sentiment",
    "breakdown": {
      "product_quality": "positive | mixed | negative",
      "availability": "positive | mixed | negative",
      "pricing": "positive | mixed | negative",
      "service": "positive | mixed | negative"
    }
  },
  "categories": [
    {
      "name": "Theme name (e.g., 'Product Quality', 'Availability', 'Pricing Concerns')",
      "description": "What this theme covers",
      "score": 0 to 10,
      "sentiment": "positive | mixed | negative",
      "evidence": "Representative quote from feedback",
      "severity": "critical | high | medium | low"
    }
  ],
  "metrics": {
    "satisfaction_index": {"value": 0 to 10, "reasoning": "Brief explanation"},
    "availability_score": {"value": 0 to 10, "reasoning": "Brief explanation"},
    "service_quality": {"value": 0 to 10, "reasoning": "Brief explanation"},
    "repeat_purchase_intent": {"value": 0 to 10, "reasoning": "Brief explanation"}
  },
  "revenue_map": {
    "relevant": true or false,
    "confidence": 0.0 to 1.0,
    "must_sell": ["Actions to protect existing revenue"],
    "upsell": ["Upsell opportunities"],
    "cross_sell": ["Cross-sell opportunities"],
    "pain_points": ["Revenue-blocking pain points"],
    "improve_strategy": ["Strategic improvements"]
  },
  "key_phrases": [
    {
      "text": "Original quote from feedback",
      "score": 0 to 10,
      "tags": ["tag1", "tag2"],
      "context": "Brief context"
    }
  ],
  "risks": [
    {
      "flag": "Description of risk",
      "severity": "critical | high | medium | low",
      "risk_type": "churn | revenue_loss | operational | competitive",
      "is_conditional": true or false,
      "condition": "Trigger condition"
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
    "what_is_working": ["What customers appreciate"],
    "what_is_breaking": ["What needs improvement"],
    "hidden_signals": ["Non-obvious insights"]
  },
  "products": [
    {
      "name": "Product/brand mentioned",
      "performance": "very_strong | strong | moderate | weak | unknown",
      "demand_level": "Very High | High | Medium | Low",
      "substitution_risk": "Very Low | Low | Medium | High",
      "feedback": "What was said"
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
    {"question": "What is the overall satisfaction level?", "answer": "Answer based on data"},
    {"question": "What are the top pain points?", "answer": "Answer based on data"},
    {"question": "What is the biggest opportunity?", "answer": "Answer based on data"}
  ]
}

SCORING GUIDELINES (0-10):
- 0-2: Not mentioned or negligible
- 3-4: Weak signals, occasional mentions
- 5-6: Moderate presence, notable
- 7-8: Strong signals, recurring theme
- 9-10: Dominant theme, critical factor"""


async def analyze_feedback_text(text: str, model: str = "big-pickle") -> dict:
    if not text or not text.strip():
        return {"error": "No feedback text provided"}

    max_chars = 150000
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[...truncated for length...]"

    user_prompt = f"""Analyze the following market feedback open-ended responses from FMCG field visits:

---
{text}
---

Provide your structured analysis as valid JSON matching the specified format."""

    try:
        content = await llm_chat(
            model=model,
            messages=[
                {"role": "system", "content": FEEDBACK_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=8000,
            top_p=0.9,
        )

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
        raise RuntimeError(f"Feedback analysis failed: {str(e)}")
