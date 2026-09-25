from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.base_service import AnalysisService
from app.models.schedule import ScheduleTask
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.schedule_repository import ScheduleRepository


class ScheduleService(AnalysisService):
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ScheduleRepository(db)
        self.analyses = AnalysisRepository(db)

    async def validate_input(self, analysis_id: UUID) -> list[str]:
        tasks = await self.repo.list_tasks(analysis_id)
        if not tasks:
            return ["schedule_no_tasks"]
        return []

    def validate_dates(self, task: ScheduleTask, new_start: date | None, new_end: date | None) -> list[str]:
        start = new_start if new_start is not None else task.start_date
        end = new_end if new_end is not None else task.end_date
        if end < start:
            return ["end_date_must_be_after_start_date"]
        return []

    async def _build_result(self, analysis_id: UUID) -> dict:
        tasks = await self.repo.list_tasks(analysis_id)
        today = datetime.now(timezone.utc).date()
        timeline_start = min((t.start_date for t in tasks), default=None)
        timeline_end = max((t.end_date for t in tasks), default=None)
        stats = {
            "total": len(tasks),
            "completed": sum(1 for t in tasks if t.progress >= 100),
            "overdue": sum(1 for t in tasks if t.end_date <= today and t.progress < 100),
        }
        return {
            "analysis_id": analysis_id, "tasks": tasks,
            "timeline_start": timeline_start, "timeline_end": timeline_end, "stats": stats,
        }

    async def calculate_result(self, analysis_id: UUID) -> dict:
        errors = await self.validate_input(analysis_id)
        if errors:
            return {"errors": errors}
        await self.analyses.mark_completed(analysis_id)
        return await self._build_result(analysis_id)

    async def get_state(self, analysis_id: UUID) -> dict:
        return await self._build_result(analysis_id)

    async def export_to_excel(self, analysis_id: UUID, lang: str = "ru") -> bytes:
        from app.services.export_service import export_schedule_to_excel

        result = await self._build_result(analysis_id)
        return export_schedule_to_excel(result["tasks"], result["timeline_start"], result["timeline_end"], stats=result["stats"], lang=lang)
