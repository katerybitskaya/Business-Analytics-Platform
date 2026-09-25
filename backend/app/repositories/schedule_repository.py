from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schedule import ScheduleTask


class ScheduleRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_tasks(self, analysis_id: UUID) -> list[ScheduleTask]:
        stmt = select(ScheduleTask).where(ScheduleTask.analysis_id == analysis_id).order_by(
            ScheduleTask.sort_order
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_task(self, analysis_id: UUID, task_id: UUID) -> ScheduleTask | None:
        stmt = select(ScheduleTask).where(
            ScheduleTask.analysis_id == analysis_id, ScheduleTask.id == task_id
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_task(self, analysis_id: UUID, **fields) -> ScheduleTask:
        existing = await self.list_tasks(analysis_id)
        next_order = (max(t.sort_order for t in existing) + 1) if existing else 0
        task = ScheduleTask(analysis_id=analysis_id, sort_order=next_order, **fields)
        self.db.add(task)
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def update_task(self, task: ScheduleTask, **fields) -> ScheduleTask:
        for key, value in fields.items():
            setattr(task, key, value)
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def delete_task(self, task: ScheduleTask) -> None:
        await self.db.delete(task)
        await self.db.commit()

    async def reorder_tasks(self, analysis_id: UUID, task_ids: list[UUID]) -> None:
        for i, task_id in enumerate(task_ids):
            stmt = (
                update(ScheduleTask)
                .where(ScheduleTask.analysis_id == analysis_id, ScheduleTask.id == task_id)
                .values(sort_order=i)
            )
            await self.db.execute(stmt)
        await self.db.commit()
