from services.gemma import extract_brain_dump
from services.normalize import normalize_extraction

transcript = (
    "Tomorrow I need to finish my DBM assignment. "
    "Also remind me to call mom at 7pm. "
    "I also have a meeting with Rahul tomorrow."
)

raw_result = extract_brain_dump(transcript)
result = normalize_extraction(raw_result)

print(result)