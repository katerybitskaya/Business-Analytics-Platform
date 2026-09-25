import uuid
from typing import Any

from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SwotResult(Base):
    __tablename__ = "swot_results"

    analysis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analyses.id", ondelete="CASCADE"), primary_key=True
    )
    activity: Mapped[str | None] = mapped_column(Text, nullable=True)

    s_scores: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    w_scores: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    o_scores: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    t_scores: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    criteria: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    user_answers: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    manual_weights: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    mode: Mapped[str | None] = mapped_column(Text, nullable=True)
