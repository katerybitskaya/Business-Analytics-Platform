import uuid
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

VALID_PAIRS = {"S/O", "S/T", "W/O", "W/T", "O/S", "O/W", "T/S", "T/W"}

PAIRS_BY_TYPE: dict[str, set[str]] = {
    "swot":      {"S/O", "S/T", "W/O", "W/T"},
    "tows":      {"O/S", "O/W", "T/S", "T/W"},
    "swot-tows": VALID_PAIRS,
}


class SwotAnalysisType(str, Enum):
    swot      = "swot"
    tows      = "tows"
    swot_tows = "swot-tows"


class SwotAnswersIn(BaseModel):
    answers: dict[str, int] = Field(description='{"S1":3,"W2":5,...}')

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, v: dict) -> dict:
        valid_codes = {f"{g}{i}" for g in "SWOT" for i in range(1, 6)}
        for code, val in v.items():
            if code not in valid_codes:
                raise ValueError(f"invalid_criterion_code: {code}")
            if not (1 <= val <= 5):
                raise ValueError(f"answer_out_of_range: {code}={val} (must be 1-5)")
        return v


class SwotWeightsIn(BaseModel):
    weights: dict[str, float] = Field(description='{"S1":0.25,"W2":0.1,...}')

    @field_validator("weights")
    @classmethod
    def validate_weights(cls, v: dict) -> dict:
        valid_codes = {f"{g}{i}" for g in "SWOT" for i in range(1, 6)}
        rounded: dict[str, float] = {}
        for code, val in v.items():
            if code not in valid_codes:
                raise ValueError(f"invalid_criterion_code: {code}")
            if not (0 < val <= 1):
                raise ValueError(f"weight_out_of_range: {code}={val} (must be 0 < w <= 1)")
            rounded[code] = round(val, 2)
        return rounded


class SwotFactor(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    code: str
    weight: float


class MatrixCellsUpdate(BaseModel):
    cells: dict[str, list[list[int]]]

    @field_validator("cells")
    @classmethod
    def valid_pair_keys(cls, v: dict) -> dict:
        invalid = set(v.keys()) - VALID_PAIRS
        if invalid:
            raise ValueError(f"invalid_pair_keys: {invalid}")
        for pair, grid in v.items():
            if len(grid) != 5 or any(len(row) != 5 for row in grid):
                raise ValueError(f"matrix_must_be_5x5: {pair}")
        return v


class StrategyQuadrant(BaseModel):
    name: str
    tables: list[str]
    total_n: int
    total_s: float


class SwotResultOut(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    analysis_id: uuid.UUID
    type: str
    status: str
    activity: str | None
    snapshot_industry: str | None = None
    title: str | None = None
    created_at: str | None = None

    mode: str | None = None
    user_answers: dict[str, int] | None = None
    manual_weights: dict[str, float] | None = None

    s_factors: list[SwotFactor]
    w_factors: list[SwotFactor]
    o_factors: list[SwotFactor]
    t_factors: list[SwotFactor]

    criteria: dict[str, Any]

    nsr: dict[str, Any]

    required_pairs: list[str]
    filled_pairs:   list[str]

    strategy: list[StrategyQuadrant] | None = None
    dominant_strategy: str | None          = None
