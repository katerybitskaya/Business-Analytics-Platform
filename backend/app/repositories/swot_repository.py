from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.swot import SwotResult


class SwotRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create(self, analysis_id: UUID) -> SwotResult:
        await self.db.execute(
            pg_insert(SwotResult)
            .values(analysis_id=analysis_id, criteria={})
            .on_conflict_do_nothing(index_elements=["analysis_id"])
        )
        await self.db.commit()
        result = await self.db.execute(
            select(SwotResult).where(SwotResult.analysis_id == analysis_id)
        )
        return result.scalar_one()

    async def save_factors(self, analysis_id: UUID, activity: str | None, s, w, o, t,
                            mode: str | None = None) -> SwotResult:
        row = await self.get_or_create(analysis_id)
        row.activity = activity
        row.s_scores = s
        row.w_scores = w
        row.o_scores = o
        row.t_scores = t
        if mode is not None:
            row.mode = mode
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def merge_criteria(self, analysis_id: UUID, new_cells: dict[str, list[str]]) -> SwotResult:
        row = await self.get_or_create(analysis_id)
        criteria = dict(row.criteria or {})
        criteria.update(new_cells)
        row.criteria = criteria
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def get(self, analysis_id: UUID) -> SwotResult | None:
        result = await self.db.execute(select(SwotResult).where(SwotResult.analysis_id == analysis_id))
        return result.scalar_one_or_none()
