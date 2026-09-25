from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.abc_xyz import AbcXyzItem, AbcXyzSession


class AbcXyzRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_session(self, analysis_id: UUID) -> AbcXyzSession:
        result = await self.db.execute(select(AbcXyzSession).where(AbcXyzSession.analysis_id == analysis_id))
        session = result.scalar_one_or_none()
        if session is None:
            session = AbcXyzSession(analysis_id=analysis_id)
            self.db.add(session)
            await self.db.commit()
        return session

    async def set_period_label(self, analysis_id: UUID, period_label: str | None) -> None:
        session = await self.get_or_create_session(analysis_id)
        session.period_label = period_label
        await self.db.commit()

    async def replace_items(self, analysis_id: UUID, items: list[dict]) -> list[AbcXyzItem]:
        await self.db.execute(delete(AbcXyzItem).where(AbcXyzItem.analysis_id == analysis_id))
        new_items = []
        for i, item in enumerate(items):
            row = AbcXyzItem(
                analysis_id=analysis_id,
                name=item["name"],
                quantity=item["quantity"],
                unit_cost=item["unit_cost"],
                sort_order=i,
            )
            self.db.add(row)
            new_items.append(row)
        await self.db.commit()
        return new_items

    async def list_items(self, analysis_id: UUID) -> list[AbcXyzItem]:
        stmt = select(AbcXyzItem).where(AbcXyzItem.analysis_id == analysis_id).order_by(AbcXyzItem.sort_order)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def save_calculated_items(self, items: list[AbcXyzItem]) -> None:
        await self.db.commit()
