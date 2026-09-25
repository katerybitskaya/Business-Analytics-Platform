import uuid
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PunktowaAnalysisType(str, Enum):
    dostawcy = "punktowa-dostawcy"
    odbiorcy = "punktowa-odbiorcy"


class ScaleUpdate(BaseModel):
    scale_min: int
    scale_max: int

    @model_validator(mode="after")
    def max_greater_than_min(self):
        if self.scale_max <= self.scale_min:
            raise ValueError("scale_max_must_be_greater_than_scale_min")
        return self


class CriterionIn(BaseModel):
    name: str = Field(min_length=1)
    weight: float = Field(gt=0, le=1)


class CriteriaUpdate(BaseModel):
    criteria: list[CriterionIn] = Field(min_length=1)


class CriterionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    weight: float
    sort_order: int


class SubjectsUpdate(BaseModel):
    names: list[str] = Field(min_length=1)


class SubjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    sort_order: int


class ScoreCell(BaseModel):
    criterion_id: uuid.UUID
    subject_id: uuid.UUID
    score: float


class ScoresUpdate(BaseModel):
    scores: list[ScoreCell] = Field(min_length=1)


class SubjectResultOut(BaseModel):
    subject_id: uuid.UUID
    subject_name: str
    avg_arithmetic: float
    avg_weighted: float
    percentage: float
    rank: int


class PunktowaStateOut(BaseModel):
    analysis_id: uuid.UUID
    type: str
    scale_min: int
    scale_max: int
    weights_sum: float
    criteria: list[CriterionOut]
    subjects: list[SubjectOut]
    scores: dict[str, float]
    invalid_scores: list[str]
    results: list[SubjectResultOut] | None = None
    top_subjects: list[uuid.UUID] | None = None
