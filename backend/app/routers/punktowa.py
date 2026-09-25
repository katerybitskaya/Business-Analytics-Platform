from uuid import UUID

from fastapi import Query,  APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.punktowa_repository import PunktowaRepository
from app.schemas.analysis import AnalysisCreate, AnalysisOut
from app.schemas.punktowa import (
    CriteriaUpdate,
    CriterionOut,
    PunktowaAnalysisType,
    PunktowaStateOut,
    ScaleUpdate,
    ScoresUpdate,
    SubjectOut,
    SubjectsUpdate,
)
from app.services.punktowa_service import PunktowaService

router = APIRouter()
VALID_TYPES = {"punktowa-dostawcy", "punktowa-odbiorcy"}


async def _get_owned_analysis_or_404(analysis_id: UUID, user: User, db: AsyncSession):
    repo = AnalysisRepository(db)
    analysis = await repo.get_owned_by_id(analysis_id, user.id)
    if not analysis or analysis.type not in VALID_TYPES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="analysis_not_found")
    return analysis


@router.get("", response_model=list[AnalysisOut])
async def list_my_punktowa_analyses(
    type: PunktowaAnalysisType | None = None,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    import asyncio
    repo = AnalysisRepository(db)
    if type:
        return await repo.list_all(user_id=current_user.id, type=type.value)
    results = await asyncio.gather(
        *[repo.list_all(user_id=current_user.id, type=t) for t in VALID_TYPES]
    )
    all_analyses = [a for batch in results for a in batch]
    all_analyses.sort(key=lambda a: a.created_at, reverse=True)
    return all_analyses


@router.post("", response_model=AnalysisOut, status_code=status.HTTP_201_CREATED)
async def create_punktowa_analysis(
    type: PunktowaAnalysisType, data: AnalysisCreate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    repo = AnalysisRepository(db)
    count = await repo.count_by_type(current_user.id, type.value)
    title = data.title or f"{type.value} #{count + 1}"
    analysis = await repo.create_for_user(current_user, type.value, title)
    return analysis


@router.put("/{analysis_id}/scale", response_model=PunktowaStateOut)
async def set_scale(
    analysis_id: UUID, data: ScaleUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = PunktowaRepository(db)
    await repo.set_scale(analysis_id, data.scale_min, data.scale_max)
    service = PunktowaService(db)
    return await service.get_state(analysis_id)


@router.put("/{analysis_id}/criteria", response_model=list[CriterionOut])
async def set_criteria(
    analysis_id: UUID, data: CriteriaUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = PunktowaRepository(db)
    return await repo.replace_criteria(analysis_id, [c.model_dump() for c in data.criteria])


@router.post("/{analysis_id}/criteria/normalize", response_model=list[CriterionOut])
async def normalize_criteria(
    analysis_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    service = PunktowaService(db)
    return await service.normalize_and_save_criteria(analysis_id)


@router.put("/{analysis_id}/subjects", response_model=list[SubjectOut])
async def set_subjects(
    analysis_id: UUID, data: SubjectsUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = PunktowaRepository(db)
    return await repo.replace_subjects(analysis_id, data.names)


@router.put("/{analysis_id}/scores", response_model=PunktowaStateOut)
async def set_scores(
    analysis_id: UUID, data: ScoresUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = PunktowaRepository(db)
    await repo.upsert_scores(analysis_id, [c.model_dump() for c in data.scores])
    service = PunktowaService(db)
    return await service.get_state(analysis_id)


@router.post("/{analysis_id}/complete", response_model=PunktowaStateOut)
async def complete_punktowa_analysis(
    analysis_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    service = PunktowaService(db)
    result = await service.calculate_result(analysis_id)
    if "errors" in result:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=result["errors"])
    return result


@router.get("/{analysis_id}", response_model=PunktowaStateOut)
async def get_punktowa_analysis(
    analysis_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    service = PunktowaService(db)
    return await service.get_state(analysis_id)


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_punktowa_analysis(
    analysis_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = AnalysisRepository(db)
    await repo.delete(analysis_id)


@router.get("/{analysis_id}/export")
async def export_punktowa_analysis(
    analysis_id: UUID, lang: str = Query("ru"), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    service = PunktowaService(db)
    content = await service.export_to_excel(analysis_id, lang=lang)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="punktowa_{analysis_id}.xlsx"'},
    )
