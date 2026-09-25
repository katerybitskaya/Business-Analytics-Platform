from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from app.repositories.audyt_repository import AudytRepository
from app.schemas.audyt import AudytResultOut, AudytVerdictOut


class AudytService:
    def __init__(self, repo: AudytRepository):
        self.repo = repo

    async def calculate_and_save(self, analysis_id: UUID) -> AudytVerdictOut:
        session = await self.repo.get_or_create_session(analysis_id)
        criteria = await self.repo.get_criteria(analysis_id)
        scores = await self.repo.get_scores(analysis_id)

        scale_max = Decimal(str(session.scale_max))
        num_auditors = session.num_auditors
        crit_pct_threshold = Decimal(str(session.criterion_acceptance_pct))
        sys_pct_threshold = Decimal(str(session.system_acceptance_pct))

        scores_by_crit: dict[UUID, list[Decimal]] = {}
        for s in scores:
            scores_by_crit.setdefault(s.criterion_id, []).append(Decimal(str(s.score)))

        results_data = []
        results_out = []

        for criterion in criteria:
            cid = criterion.id
            crit_scores = scores_by_crit.get(cid, [])
            if not crit_scores:
                results_data.append({
                    "criterion_id": cid,
                    "sum_score": None,
                    "avg_score": None,
                    "percentage": None,
                    "accepted": None,
                })
                results_out.append(AudytResultOut(
                    criterion_id=cid,
                    criterion_name=criterion.name,
                    sum_score=None,
                    avg_score=None,
                    percentage=None,
                    accepted=None,
                ))
                continue

            sum_score = sum(crit_scores)
            avg_score = (sum_score / num_auditors).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            percentage = (avg_score / scale_max * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            accepted = percentage >= crit_pct_threshold

            results_data.append({
                "criterion_id": cid,
                "sum_score": sum_score.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                "avg_score": avg_score,
                "percentage": percentage,
                "accepted": accepted,
            })
            results_out.append(AudytResultOut(
                criterion_id=cid,
                criterion_name=criterion.name,
                sum_score=sum_score.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                avg_score=avg_score,
                percentage=percentage,
                accepted=accepted,
            ))

        await self.repo.save_results(analysis_id, results_data)

        evaluated = [r for r in results_out if r.accepted is not None]
        accepted_count = sum(1 for r in evaluated if r.accepted)
        total_count = len(criteria)
        accepted_pct = (
            (Decimal(accepted_count) / Decimal(total_count) * 100).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            if total_count > 0
            else Decimal("0")
        )
        system_accepted = accepted_pct >= sys_pct_threshold

        return AudytVerdictOut(
            criteria_results=results_out,
            accepted_count=accepted_count,
            total_count=total_count,
            accepted_pct=accepted_pct,
            system_accepted=system_accepted,
        )

    async def export_to_excel(self, analysis_id: UUID, lang: str = "ru") -> bytes:
        from app.services.export_service import export_audyt_to_excel
        session = await self.repo.get_or_create_session(analysis_id)
        criteria = await self.repo.get_criteria(analysis_id)
        scores = await self.repo.get_scores(analysis_id)
        results = await self.repo.get_results(analysis_id)
        return export_audyt_to_excel(session, criteria, scores, results, lang=lang)
