from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.punktowa import (
    PunktowaCriteria,
    PunktowaResult,
    PunktowaScore,
    PunktowaSession,
    PunktowaSubject,
)


class PunktowaRepository:
    def __init__(self, db: AsyncSession):
        self.db = db


    async def get_or_create_session(self, analysis_id: UUID) -> PunktowaSession:
        await self.db.execute(
            pg_insert(PunktowaSession)
            .values(analysis_id=analysis_id)
            .on_conflict_do_nothing(index_elements=["analysis_id"])
        )
        await self.db.commit()
        result = await self.db.execute(
            select(PunktowaSession).where(PunktowaSession.analysis_id == analysis_id)
        )
        return result.scalar_one()

    async def set_scale(self, analysis_id: UUID, scale_min: int, scale_max: int) -> PunktowaSession:
        session = await self.get_or_create_session(analysis_id)
        session.scale_min = scale_min
        session.scale_max = scale_max
        await self.db.commit()
        return session


    async def list_criteria(self, analysis_id: UUID) -> list[PunktowaCriteria]:
        stmt = select(PunktowaCriteria).where(PunktowaCriteria.analysis_id == analysis_id).order_by(
            PunktowaCriteria.sort_order
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def replace_criteria(self, analysis_id: UUID, items: list[dict]) -> list[PunktowaCriteria]:
        existing = await self.list_criteria(analysis_id)
        existing_by_name = {c.name: c for c in existing}
        new_name_set = {item["name"] for item in items}

        for crit in existing:
            if crit.name not in new_name_set:
                await self.db.delete(crit)

        rows: list[PunktowaCriteria] = []
        for i, item in enumerate(items):
            if item["name"] in existing_by_name:
                row = existing_by_name[item["name"]]
                row.weight = item["weight"]
                row.sort_order = i
            else:
                row = PunktowaCriteria(analysis_id=analysis_id, name=item["name"],
                                       weight=item["weight"], sort_order=i)
                self.db.add(row)
            rows.append(row)

        await self.db.commit()
        return rows


    async def list_subjects(self, analysis_id: UUID) -> list[PunktowaSubject]:
        stmt = select(PunktowaSubject).where(PunktowaSubject.analysis_id == analysis_id).order_by(
            PunktowaSubject.sort_order
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def replace_subjects(self, analysis_id: UUID, names: list[str]) -> list[PunktowaSubject]:
        existing = await self.list_subjects(analysis_id)
        existing_by_name = {s.name: s for s in existing}
        new_name_set = set(names)

        for subj in existing:
            if subj.name not in new_name_set:
                await self.db.delete(subj)

        rows: list[PunktowaSubject] = []
        for i, name in enumerate(names):
            if name in existing_by_name:
                row = existing_by_name[name]
                row.sort_order = i
            else:
                row = PunktowaSubject(analysis_id=analysis_id, name=name, sort_order=i)
                self.db.add(row)
            rows.append(row)

        await self.db.commit()
        return rows


    async def list_scores(self, analysis_id: UUID) -> list[PunktowaScore]:
        stmt = select(PunktowaScore).where(PunktowaScore.analysis_id == analysis_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def upsert_scores(self, analysis_id: UUID, cells: list[dict]) -> None:
        existing = {(s.criterion_id, s.subject_id): s for s in await self.list_scores(analysis_id)}
        for cell in cells:
            key = (cell["criterion_id"], cell["subject_id"])
            if key in existing:
                existing[key].score = cell["score"]
            else:
                self.db.add(PunktowaScore(analysis_id=analysis_id, criterion_id=key[0], subject_id=key[1],
                                           score=cell["score"]))
        await self.db.commit()


    async def save_results(self, analysis_id: UUID, results: list[dict]) -> None:
        await self.db.execute(delete(PunktowaResult).where(PunktowaResult.analysis_id == analysis_id))
        for r in results:
            self.db.add(PunktowaResult(analysis_id=analysis_id, **r))
        await self.db.commit()

    async def list_results(self, analysis_id: UUID) -> list[PunktowaResult]:
        stmt = select(PunktowaResult).where(PunktowaResult.analysis_id == analysis_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
