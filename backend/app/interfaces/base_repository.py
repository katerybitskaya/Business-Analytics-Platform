from abc import ABC, abstractmethod
from typing import Generic, TypeVar
from uuid import UUID

ModelType = TypeVar("ModelType")


class BaseRepository(ABC, Generic[ModelType]):

    @abstractmethod
    async def get_by_id(self, entity_id: UUID) -> ModelType | None:
        raise NotImplementedError

    @abstractmethod
    async def list_all(self, **filters) -> list[ModelType]:
        raise NotImplementedError

    @abstractmethod
    async def create(self, **fields) -> ModelType:
        raise NotImplementedError

    @abstractmethod
    async def update(self, entity_id: UUID, **fields) -> ModelType | None:
        raise NotImplementedError

    @abstractmethod
    async def delete(self, entity_id: UUID) -> bool:
        raise NotImplementedError
