from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.base_service import AnalysisService
from app.models.eisenhower import EisenhowerTask
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.eisenhower_repository import EisenhowerRepository


def group_by_quadrant(tasks: list[EisenhowerTask]) -> dict:
    unscored = [t for t in tasks if t.quadrant is None]
    quadrants: dict[str, list] = {"1": [], "2": [], "3": [], "4": []}
    for t in tasks:
        if t.quadrant is not None:
            quadrants[str(t.quadrant)].append(t)
    stats = {"unscored": len(unscored), **{k: len(v) for k, v in quadrants.items()}}
    return {"unscored": unscored, "quadrants": quadrants, "stats": stats}


class EisenhowerService(AnalysisService):
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = EisenhowerRepository(db)
        self.analyses = AnalysisRepository(db)

    async def validate_input(self, analysis_id: UUID) -> list[str]:
        tasks = await self.repo.list_tasks(analysis_id)
        if not tasks:
            return ["eisenhower_no_tasks"]
        return []

    async def calculate_result(self, analysis_id: UUID) -> dict:
        errors = await self.validate_input(analysis_id)
        if errors:
            return {"errors": errors}
        await self.analyses.mark_completed(analysis_id)
        tasks = await self.repo.list_tasks(analysis_id)
        return {"analysis_id": analysis_id, **group_by_quadrant(tasks)}

    async def get_state(self, analysis_id: UUID) -> dict:
        tasks = await self.repo.list_tasks(analysis_id)
        return {"analysis_id": analysis_id, **group_by_quadrant(tasks)}

    async def export_to_excel(self, analysis_id: UUID, lang: str = "ru") -> bytes:
        from app.services.export_service import export_eisenhower_to_excel

        tasks = await self.repo.list_tasks(analysis_id)
        return export_eisenhower_to_excel(tasks, lang=lang)
