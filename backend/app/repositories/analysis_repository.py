from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.base_repository import BaseRepository
from app.models.analysis import Analysis
from app.models.user import User


class AnalysisRepository(BaseRepository[Analysis]):
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, entity_id: UUID) -> Analysis | None:
        result = await self.db.execute(select(Analysis).where(Analysis.id == entity_id))
        return result.scalar_one_or_none()

    async def get_owned_by_id(self, entity_id: UUID, user_id: UUID) -> Analysis | None:
        stmt = select(Analysis).where(Analysis.id == entity_id, Analysis.user_id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_all(self, **filters) -> list[Analysis]:
        stmt = select(Analysis)
        for field, value in filters.items():
            stmt = stmt.where(getattr(Analysis, field) == value)
        stmt = stmt.order_by(Analysis.created_at.desc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_for_user(self, user: User, type_: str, title: str | None = None) -> Analysis:
        profile = user.profile
        analysis = Analysis(
            user_id=user.id,
            type=type_,
            title=title,
            status="in_progress",
            snapshot_name=f"{user.first_name} {user.last_name}",
            snapshot_company=profile.company_name if profile else None,
            snapshot_industry=profile.industry if profile else None,
        )
        self.db.add(analysis)
        await self.db.commit()
        await self.db.refresh(analysis)
        return analysis

    async def create(self, **fields) -> Analysis:
        analysis = Analysis(**fields)
        self.db.add(analysis)
        await self.db.commit()
        await self.db.refresh(analysis)
        return analysis

    async def update(self, entity_id: UUID, **fields) -> Analysis | None:
        analysis = await self.get_by_id(entity_id)
        if not analysis:
            return None
        for key, value in fields.items():
            if hasattr(analysis, key):
                setattr(analysis, key, value)
        await self.db.commit()
        await self.db.refresh(analysis)
        return analysis

    async def delete(self, entity_id: UUID) -> bool:
        analysis = await self.get_by_id(entity_id)
        if not analysis:
            return False
        await self.db.delete(analysis)
        await self.db.commit()
        return True

    async def mark_completed(self, entity_id: UUID) -> Analysis | None:
        from datetime import datetime, timezone

        return await self.update(entity_id, status="completed", completed_at=datetime.now(timezone.utc))

    async def count_by_type(self, user_id: UUID, type_: str) -> int:
        import re
        analyses = await self.list_all(user_id=user_id, type=type_)
        max_n = 0
        for a in analyses:
            if a.title:
                m = re.search(r'#(\d+)$', a.title.strip())
                if m:
                    max_n = max(max_n, int(m.group(1)))
        return max_n

    async def get_by_title(self, user_id: UUID, title: str) -> "Analysis | None":
        stmt = select(Analysis).where(
            Analysis.user_id == user_id,
            Analysis.title == title.strip(),
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
