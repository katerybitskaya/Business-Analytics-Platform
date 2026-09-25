from uuid import UUID

from fastapi import Query,  APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.repositories.abc_xyz_repository import AbcXyzRepository
from app.repositories.analysis_repository import AnalysisRepository
from app.schemas.abc_xyz import AbcXyzItemOut, AbcXyzItemsUpdate, AbcXyzResultOut
from app.schemas.analysis import AnalysisCreate, AnalysisOut
from app.services.abc_xyz_service import AbcXyzService, apply_category_lang, build_matrix

router = APIRouter()

ANALYSIS_TYPE = "abc-xyz"


async def _get_owned_analysis_or_404(analysis_id: UUID, user: User, db: AsyncSession):
    repo = AnalysisRepository(db)
    analysis = await repo.get_owned_by_id(analysis_id, user.id)
    if not analysis or analysis.type != ANALYSIS_TYPE:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="analysis_not_found")
    return analysis


@router.get("", response_model=list[AnalysisOut])
async def list_my_abc_xyz_analyses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = AnalysisRepository(db)
    return await repo.list_all(user_id=current_user.id, type=ANALYSIS_TYPE)


@router.post("", response_model=AnalysisOut, status_code=status.HTTP_201_CREATED)
async def create_abc_xyz_analysis(
    data: AnalysisCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = AnalysisRepository(db)
    count = await repo.count_by_type(current_user.id, ANALYSIS_TYPE)
    title = data.title or f"ABC/XYZ #{count + 1}"
    return await repo.create_for_user(current_user, ANALYSIS_TYPE, title)


@router.put("/{analysis_id}/items", response_model=list[AbcXyzItemOut])
async def set_abc_xyz_items(
    analysis_id: UUID,
    data: AbcXyzItemsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = AbcXyzRepository(db)
    await repo.set_period_label(analysis_id, data.period_label)
    items = await repo.replace_items(analysis_id, [i.model_dump() for i in data.items])
    return items


@router.post("/{analysis_id}/complete", response_model=AbcXyzResultOut)
async def complete_abc_xyz_analysis(
    analysis_id: UUID,
    lang: str = Query("ru"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    service = AbcXyzService(db)
    result = await service.calculate_result(analysis_id, lang=lang)
    if "errors" in result:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=result["errors"])
    return result


@router.get("/{analysis_id}", response_model=AbcXyzResultOut)
async def get_abc_xyz_analysis(
    analysis_id: UUID,
    lang: str = Query("ru"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    analysis = await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = AbcXyzRepository(db)
    items = await repo.list_items(analysis_id)
    session = await repo.get_or_create_session(analysis_id)
    apply_category_lang(items, lang)
    return {
        "analysis_id": analysis_id,
        "period_label": session.period_label,
        "items": items,
        "matrix": build_matrix(items),
        "title": analysis.title,
        "created_at": analysis.created_at.isoformat() if analysis.created_at else None,
    }


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_abc_xyz_analysis(
    analysis_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    repo = AnalysisRepository(db)
    await repo.delete(analysis_id)


@router.get("/{analysis_id}/export")
async def export_abc_xyz_analysis(
    analysis_id: UUID,
    lang: str = Query("ru"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_analysis_or_404(analysis_id, current_user, db)
    service = AbcXyzService(db)
    content = await service.export_to_excel(analysis_id, lang=lang)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="abc_xyz_{analysis_id}.xlsx"'},
    )
