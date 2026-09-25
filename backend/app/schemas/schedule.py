import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ScheduleTaskCreate(BaseModel):
    title: str = Field(min_length=1)
    responsible: str | None = None
    category: str | None = None
    start_date: date
    end_date: date
    progress: int = Field(default=0, ge=0, le=100)
    color: str | None = None
    parent_id: uuid.UUID | None = None
    depends_on: list[uuid.UUID] | None = None

    @model_validator(mode="after")
    def end_after_start(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date_must_be_after_start_date")
        return self


class ScheduleTaskUpdate(BaseModel):
    title: str | None = None
    responsible: str | None = None
    category: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    color: str | None = None
    parent_id: uuid.UUID | None = None
    depends_on: list[uuid.UUID] | None = None


class ScheduleTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    parent_id: uuid.UUID | None
    title: str
    responsible: str | None
    category: str | None
    start_date: date
    end_date: date
    progress: int
    color: str | None
    depends_on: list[uuid.UUID] | None
    sort_order: int


class ReorderRequest(BaseModel):
    task_ids: list[uuid.UUID]


class ScheduleResultOut(BaseModel):
    analysis_id: uuid.UUID
    tasks: list[ScheduleTaskOut]
    timeline_start: date | None
    timeline_end: date | None
    stats: dict[str, int]
