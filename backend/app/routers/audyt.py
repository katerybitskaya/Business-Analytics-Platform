from uuid import UUID

from fastapi import Query,  APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.audyt_repository import AudytRepository
from app.schemas.analysis import AnalysisCreate, AnalysisOut
from app.schemas.audyt import (
    AudytCriteriaSetRequest,
    AudytCriterionOut,
    AudytFullOut,
    AudytScoreOut,
    AudytScoresBulkIn,
    AudytSessionOut,
    AudytSessionUpdate,
    AudytVerdictOut,
)
from app.services.audyt_service import AudytService

router = APIRouter()


async def _get_owned_audyt_or_404(analysis_id: UUID, user: User, db: AsyncSession):
    repo = AnalysisRepository(db)
    analysis = await repo.get_owned_by_id(analysis_id, user.id)
    if not analysis or analysis.type != "audyt":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="analysis_not_found")
    return analysis


@router.get("", response_model=list[AnalysisOut])
async def list_audyt(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = AnalysisRepository(db)
    return await repo.list_all(user_id=current_user.id, type="audyt")


@router.post("", response_model=AnalysisOut, status_code=status.HTTP_201_CREATED)
async def create_audyt(
    body: AnalysisCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    analysis_repo = AnalysisRepository(db)
    audyt_repo = AudytRepository(db)
    count = await analysis_repo.count_by_type(current_user.id, "audyt")
    title = body.title or f"audyt #{count + 1}"
    analysis = await analysis_repo.create_for_user(current_user, "audyt", title)
    await audyt_repo.get_or_create_session(analysis.id)
    return analysis


@router.get("/{analysis_id}", response_model=AudytFullOut)
async def get_audyt(
    analysis_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_audyt_or_404(analysis_id, current_user, db)
    repo = AudytRepository(db)
    session = await repo.get_or_create_session(analysis_id)
    criteria = await repo.get_criteria(analysis_id)
    scores = await repo.get_scores(analysis_id)
    results = await repo.get_results(analysis_id)

    verdict = None
    if results:
        crit_by_id = {c.id: c.name for c in criteria}
        from app.schemas.audyt import AudytResultOut, AudytVerdictOut
        from decimal import Decimal
        results_out = [
            AudytResultOut(
                criterion_id=r.criterion_id,
                criterion_name=crit_by_id.get(r.criterion_id, ""),
                sum_score=r.sum_score,
                avg_score=r.avg_score,
                percentage=r.percentage,
                accepted=r.accepted,
            )
            for r in results
        ]
        evaluated = [r for r in results_out if r.accepted is not None]
        accepted_count = sum(1 for r in evaluated if r.accepted)
        total_count = len(criteria)
        accepted_pct = (
            (Decimal(accepted_count) / Decimal(total_count) * 100).quantize(Decimal("0.01"))
            if total_count > 0
            else Decimal("0")
        )
        verdict = AudytVerdictOut(
            criteria_results=results_out,
            accepted_count=accepted_count,
            total_count=total_count,
            accepted_pct=accepted_pct,
            system_accepted=accepted_pct >= Decimal(str(session.system_acceptance_pct)),
        )

    return AudytFullOut(
        session=AudytSessionOut.model_validate(session),
        criteria=[AudytCriterionOut.model_validate(c) for c in criteria],
        scores=[AudytScoreOut.model_validate(s) for s in scores],
        verdict=verdict,
    )


@router.patch("/{analysis_id}/session", response_model=AudytSessionOut)
async def update_session(
    analysis_id: UUID,
    body: AudytSessionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_audyt_or_404(analysis_id, current_user, db)
    repo = AudytRepository(db)
    session = await repo.update_session(
        analysis_id=analysis_id,
        scale_min=body.scale_min,
        scale_max=body.scale_max,
        num_auditors=body.num_auditors,
        score_red_threshold=body.score_red_threshold,
        criterion_acceptance_pct=body.criterion_acceptance_pct,
        system_acceptance_pct=body.system_acceptance_pct,
    )
    return AudytSessionOut.model_validate(session)


@router.put("/{analysis_id}/criteria", response_model=list[AudytCriterionOut])
async def set_criteria(
    analysis_id: UUID,
    body: AudytCriteriaSetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_audyt_or_404(analysis_id, current_user, db)
    repo = AudytRepository(db)
    names = [c.name for c in body.criteria]
    criteria = await repo.set_criteria(analysis_id, names)
    return [AudytCriterionOut.model_validate(c) for c in criteria]


@router.put("/{analysis_id}/scores", response_model=list[AudytScoreOut])
async def save_scores(
    analysis_id: UUID,
    body: AudytScoresBulkIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_audyt_or_404(analysis_id, current_user, db)
    repo = AudytRepository(db)
    scores_data = [
        {
            "criterion_id": s.criterion_id,
            "auditor_number": s.auditor_number,
            "score": s.score,
        }
        for s in body.scores
    ]
    result = await repo.bulk_upsert_scores(analysis_id, scores_data)
    return [AudytScoreOut.model_validate(s) for s in result]


@router.post("/{analysis_id}/calculate", response_model=AudytVerdictOut)
async def calculate(
    analysis_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_audyt_or_404(analysis_id, current_user, db)
    repo = AudytRepository(db)
    service = AudytService(repo)
    verdict = await service.calculate_and_save(analysis_id)
    analysis_repo = AnalysisRepository(db)
    await analysis_repo.mark_completed(analysis_id)
    return verdict


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_audyt(
    analysis_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_audyt_or_404(analysis_id, current_user, db)
    repo = AnalysisRepository(db)
    await repo.delete(analysis_id)


@router.get("/{analysis_id}/export/xlsx")
async def export_xlsx(
    analysis_id: UUID,
    lang: str = Query("ru"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_audyt_or_404(analysis_id, current_user, db)
    repo = AudytRepository(db)
    service = AudytService(repo)
    xlsx_bytes = await service.export_to_excel(analysis_id, lang=lang)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="audyt_{analysis_id}.xlsx"'},
    )
