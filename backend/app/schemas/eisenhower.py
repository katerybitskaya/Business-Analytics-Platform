import uuid

from pydantic import BaseModel, ConfigDict, Field


class EisenhowerTaskCreate(BaseModel):
    title: str = Field(min_length=1)
    quadrant: int | None = Field(default=None, ge=1, le=4)


class EisenhowerTaskUpdate(BaseModel):
    title: str | None = None
    quadrant: int | None = None
    is_done: bool | None = None


class EisenhowerTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    quadrant: int | None
    is_done: bool
    sort_order: int


class EisenhowerResultOut(BaseModel):
    analysis_id: uuid.UUID
    unscored: list[EisenhowerTaskOut]
    quadrants: dict[str, list[EisenhowerTaskOut]]
    stats: dict[str, int]
