import json
import urllib.request
from models.extraction import ExtractionResult


GEMMA_URL = "http://127.0.0.1:8080/v1/chat/completions"


def extract_brain_dump(transcript: str) -> dict:
    prompt = f"""
You are Unbox's extraction engine.

Extract ONLY information explicitly stated in the brain dump.
Do not invent missing dates, times, people, or details.

Classify:
- tasks = things the user needs to do
- events = meetings, appointments, or scheduled occurrences
- reminders = things the user explicitly asks to be reminded about
- people = people mentioned
- ideas = ideas explicitly stated
- uncertainties = information that is ambiguous or unclear

Return ONLY valid JSON in exactly this format:

{{
  "tasks": [],
  "events": [],
  "reminders": [],
  "people": [],
  "ideas": [],
  "uncertainties": []
}}

Brain dump:
"{transcript}"
"""

    payload = {
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
        "temperature": 0,
        "max_tokens": 300,
    }

    request = urllib.request.Request(
        GEMMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=120) as response:
        result = json.loads(response.read().decode("utf-8"))

    content = result["choices"][0]["message"]["content"].strip()

    start = content.find("{")
    end = content.rfind("}")

    if start == -1 or end == -1:
        raise ValueError("Gemma did not return valid JSON")

    extracted = json.loads(content[start:end + 1])

    return ExtractionResult.model_validate(extracted).model_dump()