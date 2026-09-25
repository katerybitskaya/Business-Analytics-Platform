from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.eisenhower import EisenhowerTask


class EisenhowerRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_tasks(self, analysis_id: UUID) -> list[EisenhowerTask]:
        stmt = select(EisenhowerTask).where(EisenhowerTask.analysis_id == analysis_id).order_by(
            EisenhowerTask.sort_order
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_task(self, analysis_id: UUID, task_id: UUID) -> EisenhowerTask | None:
        stmt = select(EisenhowerTask).where(
            EisenhowerTask.analysis_id == analysis_id, EisenhowerTask.id == task_id
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_task(self, analysis_id: UUID, **fields) -> EisenhowerTask:
        existing = await self.list_tasks(analysis_id)
        task = EisenhowerTask(analysis_id=analysis_id, sort_order=len(existing), **fields)
        self.db.add(task)
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def update_task(self, task: EisenhowerTask, **fields) -> EisenhowerTask:
        for key, value in fields.items():
            setattr(task, key, value)
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def delete_task(self, task: EisenhowerTask) -> None:
        await self.db.delete(task)
        await self.db.commit()
