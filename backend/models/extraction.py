from pydantic import BaseModel, Field


class ExtractionResult(BaseModel):
    tasks: list[str] = Field(default_factory=list)
    events: list[str] = Field(default_factory=list)
    reminders: list[str] = Field(default_factory=list)
    people: list[str] = Field(default_factory=list)
    ideas: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)