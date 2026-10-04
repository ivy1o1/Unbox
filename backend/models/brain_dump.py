from datetime import datetime
from uuid import uuid4

from pydantic import BaseModel
from sqlalchemy import DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class BrainDump(Base):
    __tablename__ = "brain_dumps"

    id: Mapped[str] = mapped_column(
        primary_key=True,
        default=lambda: str(uuid4()),
    )

    title: Mapped[str | None] = mapped_column(
        nullable=True,
    )

    audio_path: Mapped[str | None] = mapped_column(
        nullable=True,
    )

    transcript: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )


class BrainDumpCreate(BaseModel):
    title: str | None = None


class BrainDumpTranscript(BaseModel):
    transcript: str