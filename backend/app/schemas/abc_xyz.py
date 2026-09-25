import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AbcXyzItemIn(BaseModel):
    name: str = Field(min_length=1)
    quantity: float = Field(gt=0, description="Количество продаж (Sprzedaż)")
    unit_cost: float = Field(gt=0, description="Цена единицы (Koszt jednostkowy)")

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name_required")
        return v.strip()


class AbcXyzItemsUpdate(BaseModel):
    period_label: str | None = None
    items: list[AbcXyzItemIn] = Field(min_length=1)


class AbcXyzItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    quantity: float
    unit_cost: float
    sales_value: float | None
    share_pct: float | None
    cumulative_pct: float | None
    cv: float | None
    abc_class: str | None
    xyz_class: str | None
    category: str | None
    sort_order: int


class AbcXyzMatrixCell(BaseModel):
    abc_class: str
    xyz_class: str
    items: list[str]


class AbcXyzResultOut(BaseModel):
    analysis_id: uuid.UUID
    period_label: str | None
    items: list[AbcXyzItemOut]
    matrix: list[AbcXyzMatrixCell]
    title: str | None = None
    created_at: str | None = None
