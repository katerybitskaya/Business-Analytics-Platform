from uuid import UUID

from fastapi import Query, APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.swot_repository import SwotRepository
from app.schemas.analysis import AnalysisCreate, AnalysisOut
from app.schemas.swot import (
    MatrixCellsUpdate, SwotAnalysisType, SwotAnswersIn, SwotResultOut, SwotWeightsIn,
)
from app.services.swot_service import SwotService

router = APIRouter()

VALID_TYPES = {"swot", "tows", "swot-tows"}


async def _get_owned_or_404(analysis_id: UUID, user: User, db: AsyncSession):
    repo = AnalysisRepository(db)
    analysis = await repo.get_owned_by_id(analysis_id, user.id)
    if not analysis or analysis.type not in VALID_TYPES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="analysis_not_found")
    return analysis


@router.get("", response_model=list[AnalysisOut])
async def list_my_swot_analyses(
    type: SwotAnalysisType | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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
async def create_swot_analysis(
    type: SwotAnalysisType,
    body: AnalysisCreate | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = AnalysisRepository(db)
    count = await repo.count_by_type(current_user.id, type.value)
    label = {"swot": "SWOT", "tows": "TOWS", "swot-tows": "SWOT-TOWS"}[type.value]
    title = (body.title if body else None) or f"{label} #{count + 1}"
    return await repo.create_for_user(current_user, type.value, title)


@router.get("/questions")
async def get_swot_questions(current_user: User = Depends(get_current_user)):
    from app.data.swot_questions import get_activity, _SCALES, CRITERIA_CODES
    industry = None
    if current_user.profile:
        industry = current_user.profile.industry
    activity = get_activity(industry)
    if not activity:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="swot_questions_not_found_set_industry_in_profile",
        )
    return {
        "industry": industry,
        "activity_name": activity["name"],
        "criteria": activity["criteria"],
        "scales": _SCALES,
        "criteria_codes": CRITERIA_CODES,
    }


@router.post("/{analysis_id}/answers", response_model=SwotResultOut)
async def submit_swot_answers(
    analysis_id: UUID,
    data: SwotAnswersIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_or_404(analysis_id, current_user, db)
    industry = current_user.profile.industry if current_user.profile else None
    service = SwotService(db)
    return await service.process_answers(analysis_id, data.answers, industry)


@router.put("/{analysis_id}/weights", response_model=SwotResultOut)
async def set_swot_manual_weights(
    analysis_id: UUID,
    data: SwotWeightsIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_or_404(analysis_id, current_user, db)
    industry = current_user.profile.industry if current_user.profile else None
    service = SwotService(db)
    return await service.process_manual_weights(analysis_id, data.weights, industry)


@router.put("/{analysis_id}/matrix", response_model=SwotResultOut)
async def set_swot_matrix(
    analysis_id: UUID,
    data: MatrixCellsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_or_404(analysis_id, current_user, db)
    repo = SwotRepository(db)
    await repo.merge_criteria(analysis_id, data.cells)
    service = SwotService(db)
    return await service.get_state(analysis_id)


@router.post("/{analysis_id}/complete", response_model=SwotResultOut)
async def complete_swot_analysis(
    analysis_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_or_404(analysis_id, current_user, db)
    service = SwotService(db)
    result = await service.calculate_result(analysis_id)
    if "errors" in result:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=result["errors"])
    return result


@router.get("/{analysis_id}", response_model=SwotResultOut)
async def get_swot_analysis(
    analysis_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_or_404(analysis_id, current_user, db)
    service = SwotService(db)
    return await service.get_state(analysis_id)


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_swot_analysis(
    analysis_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_or_404(analysis_id, current_user, db)
    repo = AnalysisRepository(db)
    await repo.delete(analysis_id)


@router.post("/{analysis_id}/extend", status_code=status.HTTP_201_CREATED)
async def extend_to_swot_tows(
    analysis_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_or_404(analysis_id, current_user, db)
    service = SwotService(db)
    try:
        return await service.create_extended_analysis(analysis_id, current_user)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{analysis_id}/export")
async def export_swot_analysis(
    analysis_id: UUID,
    lang: str = Query("ru"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_or_404(analysis_id, current_user, db)
    service = SwotService(db)
    content = await service.export_to_excel(analysis_id, lang=lang)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="swot_{analysis_id}.xlsx"'},
    )
