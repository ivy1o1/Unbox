from models.extraction import ExtractionResult


def normalize_extraction(data: dict) -> dict:
    result = ExtractionResult.model_validate(data)

    # If something is explicitly a reminder, it should not also be an event.
    reminder_items = set(result.reminders)

    result.events = [
        item for item in result.events
        if item not in reminder_items
    ]

    return result.model_dump()