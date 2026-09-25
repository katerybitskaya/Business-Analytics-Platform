import uuid
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, field_validator


class AudytSessionUpdate(BaseModel):
    scale_min: int = Field(ge=0)
    scale_max: int = Field(ge=1)
    num_auditors: int = Field(ge=2)
    score_red_threshold: Decimal = Field(ge=0)
    criterion_acceptance_pct: Decimal = Field(ge=0, le=100)
    system_acceptance_pct: Decimal = Field(ge=0, le=100)

    @field_validator("scale_max")
    @classmethod
    def max_gt_min(cls, v: int, info) -> int:
        mn = info.data.get("scale_min")
        if mn is not None and v <= mn:
            raise ValueError("scale_max must be greater than scale_min")
        return v

    @field_validator("score_red_threshold")
    @classmethod
    def threshold_two_dp(cls, v: Decimal) -> Decimal:
        if v.as_tuple().exponent < -2:
            raise ValueError("score_red_threshold allows at most 2 decimal places")
        return v


class AudytSessionOut(BaseModel):
    analysis_id: uuid.UUID
    scale_min: int
    scale_max: int
    num_auditors: int
    score_red_threshold: Decimal
    criterion_acceptance_pct: Decimal
    system_acceptance_pct: Decimal

    model_config = {"from_attributes": True}


class AudytCriterionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    sort_order: int = Field(default=0)


class AudytCriterionOut(BaseModel):
    id: uuid.UUID
    analysis_id: uuid.UUID
    name: str
    sort_order: int

    model_config = {"from_attributes": True}


class AudytCriteriaSetRequest(BaseModel):
    criteria: list[AudytCriterionCreate]


class AudytScoreIn(BaseModel):
    criterion_id: uuid.UUID
    auditor_number: int = Field(ge=1)
    score: Annotated[Decimal, Field(ge=0)]

    @field_validator("score")
    @classmethod
    def score_two_dp(cls, v: Decimal) -> Decimal:
        if v.as_tuple().exponent < -2:
            raise ValueError("score allows at most 2 decimal places")
        return v


class AudytScoresBulkIn(BaseModel):
    scores: list[AudytScoreIn]


class AudytScoreOut(BaseModel):
    id: uuid.UUID
    criterion_id: uuid.UUID
    auditor_number: int
    score: Decimal

    model_config = {"from_attributes": True}


class AudytResultOut(BaseModel):
    criterion_id: uuid.UUID
    criterion_name: str
    sum_score: Decimal | None
    avg_score: Decimal | None
    percentage: Decimal | None
    accepted: bool | None

    model_config = {"from_attributes": True}


class AudytVerdictOut(BaseModel):
    criteria_results: list[AudytResultOut]
    accepted_count: int
    total_count: int
    accepted_pct: Decimal
    system_accepted: bool


class AudytFullOut(BaseModel):
    session: AudytSessionOut
    criteria: list[AudytCriterionOut]
    scores: list[AudytScoreOut]
    verdict: AudytVerdictOut | None
