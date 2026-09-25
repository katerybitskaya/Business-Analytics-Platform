from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID


class AnalysisService(ABC):

    @abstractmethod
    async def validate_input(self, analysis_id: UUID) -> list[str]:
        raise NotImplementedError

    @abstractmethod
    async def calculate_result(self, analysis_id: UUID) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def export_to_excel(self, analysis_id: UUID, lang: str = "ru") -> bytes:
        raise NotImplementedError
