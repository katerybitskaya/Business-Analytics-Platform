import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.user import EmailChangeRequest, UserOut, UserProfileOut, UserProfileUpdate, UserUpdate

router = APIRouter()

UPLOAD_DIR = "uploads/avatars"
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 2 * 1024 * 1024


@router.get("/me", response_model=UserOut)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_my_account(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = UserRepository(db)
    updated = await repo.update(current_user.id, **data.model_dump(exclude_unset=True))
    return updated


@router.patch("/me/profile", response_model=UserProfileOut)
async def update_my_company_profile(
    data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = UserRepository(db)
    fields = data.model_dump(exclude_unset=True)
    if "company_size" in fields and fields["company_size"] is not None:
        fields["company_size"] = fields["company_size"].value if hasattr(fields["company_size"], "value") else fields["company_size"]
    updated = await repo.update_profile(current_user.id, **fields)
    return updated


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="avatar_invalid_type",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="avatar_too_large",
        )

    if current_user.photo:
        old_path = current_user.photo.lstrip("/")
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, filename)

    async with aiofiles.open(file_path, "wb") as out:
        await out.write(content)

    photo_url = f"/{file_path}"
    repo = UserRepository(db)
    updated = await repo.update_photo(current_user.id, photo_url)
    return updated


@router.delete("/me/avatar", response_model=UserOut)
async def delete_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.photo:
        old_path = current_user.photo.lstrip("/")
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    repo = UserRepository(db)
    updated = await repo.update_photo(current_user.id, None)
    return updated


@router.patch("/me/email", response_model=UserOut)
async def change_my_email(
    data: EmailChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = UserRepository(db)
    existing = await repo.get_by_email(data.email)
    if existing and existing.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email_taken",
        )
    updated = await repo.update(current_user.id, email=data.email)
    return updated


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.photo:
        old_path = current_user.photo.lstrip("/")
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass
    repo = UserRepository(db)
    await repo.delete(current_user.id)


from uuid import UUID as _UUID
from pydantic import BaseModel as _BaseModel

class _TitleUpdate(_BaseModel):
    title: str

@router.patch("/me/analyses/{analysis_id}/title")
async def rename_analysis(
    analysis_id: _UUID,
    body: _TitleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.repositories.analysis_repository import AnalysisRepository
    repo = AnalysisRepository(db)
    analysis = await repo.get_owned_by_id(analysis_id, current_user.id)
    if not analysis:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="analysis_not_found")
    new_title = body.title.strip() or analysis.title
    if new_title != analysis.title:
        duplicate = await repo.get_by_title(current_user.id, new_title)
        if duplicate and duplicate.id != analysis_id:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="title_already_exists")
    updated = await repo.update(analysis_id, title=new_title)
    return {"id": str(updated.id), "title": updated.title}
