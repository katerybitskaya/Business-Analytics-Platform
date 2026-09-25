from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audyt import (
    AudytCriterion,
    AudytResult,
    AudytScore,
    AudytSession,
)


class AudytRepository:
    def __init__(self, db: AsyncSession):
        self.db = db


    async def get_or_create_session(self, analysis_id: UUID) -> AudytSession:
        await self.db.execute(
            pg_insert(AudytSession)
            .values(analysis_id=analysis_id)
            .on_conflict_do_nothing(index_elements=["analysis_id"])
        )
        await self.db.commit()
        result = await self.db.execute(
            select(AudytSession).where(AudytSession.analysis_id == analysis_id)
        )
        return result.scalar_one()

    async def update_session(
        self,
        analysis_id: UUID,
        scale_min: int,
        scale_max: int,
        num_auditors: int,
        score_red_threshold: Decimal,
        criterion_acceptance_pct: Decimal,
        system_acceptance_pct: Decimal,
    ) -> AudytSession:
        session = await self.get_or_create_session(analysis_id)
        session.scale_min = scale_min
        session.scale_max = scale_max
        session.num_auditors = num_auditors
        session.score_red_threshold = score_red_threshold
        session.criterion_acceptance_pct = criterion_acceptance_pct
        session.system_acceptance_pct = system_acceptance_pct
        await self.db.commit()
        return session


    async def get_criteria(self, analysis_id: UUID) -> list[AudytCriterion]:
        result = await self.db.execute(
            select(AudytCriterion)
            .where(AudytCriterion.analysis_id == analysis_id)
            .order_by(AudytCriterion.sort_order)
        )
        return list(result.scalars().all())

    async def set_criteria(self, analysis_id: UUID, names: list[str]) -> list[AudytCriterion]:
        result = await self.db.execute(
            select(AudytCriterion).where(AudytCriterion.analysis_id == analysis_id)
        )
        existing = list(result.scalars().all())
        existing_by_name = {c.name: c for c in existing}
        kept_ids: set = set()

        final: list[AudytCriterion] = []
        for i, name in enumerate(names):
            if name in existing_by_name:
                c = existing_by_name[name]
                c.sort_order = i
                kept_ids.add(c.id)
                final.append(c)
            else:
                c = AudytCriterion(analysis_id=analysis_id, name=name, sort_order=i)
                self.db.add(c)
                final.append(c)

        for c in existing:
            if c.id not in kept_ids:
                await self.db.delete(c)

        await self.db.commit()
        return final


    async def get_scores(self, analysis_id: UUID) -> list[AudytScore]:
        result = await self.db.execute(
            select(AudytScore).where(AudytScore.analysis_id == analysis_id)
        )
        return list(result.scalars().all())

    async def upsert_score(
        self, analysis_id: UUID, criterion_id: UUID, auditor_number: int, score: Decimal
    ) -> AudytScore:
        result = await self.db.execute(
            select(AudytScore).where(
                AudytScore.criterion_id == criterion_id,
                AudytScore.auditor_number == auditor_number,
            )
        )
        obj = result.scalar_one_or_none()
        if obj is None:
            obj = AudytScore(
                analysis_id=analysis_id,
                criterion_id=criterion_id,
                auditor_number=auditor_number,
                score=score,
            )
            self.db.add(obj)
        else:
            obj.score = score
        return obj

    async def bulk_upsert_scores(
        self, analysis_id: UUID, scores_data: list[dict]
    ) -> list[AudytScore]:
        result = []
        for item in scores_data:
            s = await self.upsert_score(
                analysis_id=analysis_id,
                criterion_id=item["criterion_id"],
                auditor_number=item["auditor_number"],
                score=item["score"],
            )
            result.append(s)
        await self.db.commit()
        return result


    async def save_results(self, analysis_id: UUID, results_data: list[dict]) -> list[AudytResult]:
        await self.db.execute(
            delete(AudytResult).where(AudytResult.analysis_id == analysis_id)
        )
        objs = [AudytResult(analysis_id=analysis_id, **r) for r in results_data]
        self.db.add_all(objs)
        await self.db.commit()
        return objs

    async def get_results(self, analysis_id: UUID) -> list[AudytResult]:
        result = await self.db.execute(
            select(AudytResult).where(AudytResult.analysis_id == analysis_id)
        )
        return list(result.scalars().all())
