# backend/models/brain_dump.py

from datetime import datetime
from uuid import uuid4

from pydantic import BaseModel
from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class BrainDump(Base):
    __tablename__ = "brain_dumps"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid4()),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    title: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    audio_path: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    transcript: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    extraction: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    user = relationship(
        "User",
        back_populates="brain_dumps",
    )


class BrainDumpCreate(BaseModel):
    title: str | None = None


class BrainDumpTranscript(BaseModel):
    transcript: str