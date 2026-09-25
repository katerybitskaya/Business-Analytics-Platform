import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AnalysisCreate(BaseModel):
    title: str | None = None


class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    title: str | None
    status: str
    snapshot_name: str | None
    snapshot_company: str | None
    snapshot_industry: str | None
    extends_analysis_id: uuid.UUID | None
    created_at: datetime
    completed_at: datetime | None
    task_count: int | None = None
