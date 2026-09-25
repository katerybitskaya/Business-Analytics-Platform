from uuid import UUID

from fastapi import Query,  APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.schedule_repository import ScheduleRepository
from app.schemas.analysis import AnalysisCreate, AnalysisOut
from app.schemas.schedule import ReorderRequest, ScheduleResultOut, ScheduleTaskCreate, ScheduleTaskOut, ScheduleTaskUpdate
from app.services.schedule_service import ScheduleService

router = APIRouter()
ANALYSIS_TYPE = "schedule"


async def _get_owned_analysis_or_404(analysis_id: UUID, user: User, db: AsyncSession):
    repo = AnalysisRepository(db)
    analysis = await repo.get_owned_by_id(analysis_id, user.id)
    if not analysis or analysis.type != ANALYSIS_TYPE:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="analysis_not_found")
    return analysis


@router.get("", response_model=list[AnalysisOut])
async def list_my_schedule_analyses(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import func, select as sa_select
    from app.models.schedule import ScheduleTask

    repo = AnalysisRepository(db)
    analyses = await repo.list_all(user_id=current_user.id, type=ANALYSIS_TYPE)
    if not analyses:
        return []

    ids = [a.id for a in analyses]
    count_result = await db.execute(
        sa_select(ScheduleTask.analysis_id, func.count(ScheduleTask.id).label("cnt"))
        .where(ScheduleTask.analysis_id.in_(ids))
        .group_by(ScheduleTask.analysis_id)
    )
    counts = {row.analysis_id: row.cnt for row in count_result}

    result = []
    for a in analyses:
        out = AnalysisOut.model_validate(a)
        out.task_count = counts.get(a.id, 0)
        result.append(out)
    return result


@router.post("", response_model=AnalysisOut, status_code=status.HTTP_201_CREATED)
async def create_schedule_analysis(
    data: AnalysisCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    repo = AnalysisRepository(db)
    count = await repo.count_by_type(current_user.id, ANALYSIS_TYPE)
    title = data.title or f"schedule #{count + 1}"
    return await repo.create_for_user(current_user, ANALYSIS_TYPE, title)


@router.post("/{analysis_id}/tasks", response_model=ScheduleTaskOut, status_code=status.HTTP_201_CREATED)
async def add_task(
    analysis_id: UUID, data: ScheduleTaskCreate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = ScheduleRepository(db)
    fields = data.model_dump()
    fields["depends_on"] = fields["depends_on"] or None
    return await repo.create_task(analysis_id, **fields)


@router.patch("/{analysis_id}/tasks/{task_id}", response_model=ScheduleTaskOut)
async def update_task(
    analysis_id: UUID, task_id: UUID, data: ScheduleTaskUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = ScheduleRepository(db)
    task = await repo.get_task(analysis_id, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="task_not_found")

    service = ScheduleService(db)
    errors = service.validate_dates(task, data.start_date, data.end_date)
    if errors:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=errors)

    fields = data.model_dump(exclude_unset=True)
    return await repo.update_task(task, **fields)


@router.delete("/{analysis_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    analysis_id: UUID, task_id: UUID,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = ScheduleRepository(db)
    task = await repo.get_task(analysis_id, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="task_not_found")
    await repo.delete_task(task)


@router.post("/{analysis_id}/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_tasks(
    analysis_id: UUID,
    data: ReorderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = ScheduleRepository(db)
    await repo.reorder_tasks(analysis_id, data.task_ids)


@router.post("/{analysis_id}/complete", response_model=ScheduleResultOut)
async def complete_schedule_analysis(
    analysis_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    service = ScheduleService(db)
    result = await service.calculate_result(analysis_id)
    if "errors" in result:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=result["errors"])
    return result


@router.get("/{analysis_id}", response_model=ScheduleResultOut)
async def get_schedule_analysis(
    analysis_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    service = ScheduleService(db)
    return await service.get_state(analysis_id)


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule_analysis(
    analysis_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = AnalysisRepository(db)
    await repo.delete(analysis_id)


@router.get("/{analysis_id}/export")
async def export_schedule_analysis(
    analysis_id: UUID, lang: str = Query("ru"), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    service = ScheduleService(db)
    content = await service.export_to_excel(analysis_id, lang=lang)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="schedule_{analysis_id}.xlsx"'},
    )
