import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AbcXyzSession(Base):
    __tablename__ = "abc_xyz_sessions"

    analysis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analyses.id", ondelete="CASCADE"), primary_key=True
    )
    period_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    abc_thresholds: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=lambda: {"a": 0.70, "b": 0.90}
    )


class AbcXyzItem(Base):
    __tablename__ = "abc_xyz_items"
    __table_args__ = (Index("idx_abc_items_analysis", "analysis_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric, nullable=False)
    unit_cost: Mapped[float] = mapped_column(Numeric, nullable=False)

    sales_value: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    share_pct: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    cumulative_pct: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    cv: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    abc_class: Mapped[str | None] = mapped_column(Text, nullable=True)
    xyz_class: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
