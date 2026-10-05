from datetime import datetime
from uuid import uuid4

from pydantic import BaseModel
from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid4()),
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    brain_dumps = relationship(
        "BrainDump",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class UserCreate(BaseModel):
    name: str