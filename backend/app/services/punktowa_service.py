from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.base_service import AnalysisService
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.punktowa_repository import PunktowaRepository

WEIGHT_SUM_TOLERANCE = 0.005


def normalize_weights(weights: list[float]) -> list[float]:
    total = sum(weights)
    if total <= 0:
        return weights
    normalized = [round(w / total, 2) for w in weights]
    diff = round(1.0 - sum(normalized), 2)
    if diff != 0 and normalized:
        max_idx = normalized.index(max(normalized))
        normalized[max_idx] = round(normalized[max_idx] + diff, 2)
    return normalized


class PunktowaService(AnalysisService):
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = PunktowaRepository(db)
        self.analyses = AnalysisRepository(db)

    async def validate_input(self, analysis_id: UUID) -> list[str]:
        errors = []
        criteria = await self.repo.list_criteria(analysis_id)
        subjects = await self.repo.list_subjects(analysis_id)
        scores = await self.repo.list_scores(analysis_id)
        session = await self.repo.get_or_create_session(analysis_id)

        if not criteria:
            errors.append("punktowa_no_criteria")
        else:
            total_weight = sum(c.weight for c in criteria)
            if abs(float(total_weight) - 1.0) > WEIGHT_SUM_TOLERANCE:
                errors.append(f"weights_sum_must_be_1 (сейчас {float(total_weight):.3f})")

        if len(subjects) < 2:
            errors.append("punktowa_min_2_subjects")

        if criteria and subjects:
            expected_cells = {(c.id, s.id) for c in criteria for s in subjects}
            filled_cells = {(s.criterion_id, s.subject_id) for s in scores}
            missing = expected_cells - filled_cells
            if missing:
                errors.append(f"missing_scores_count: {len(missing)}")
            out_of_range = [
                s for s in scores
                if not (session.scale_min <= float(s.score) <= session.scale_max)
            ]
            if out_of_range:
                errors.append(f"scores_out_of_range_count: {len(out_of_range)}")

        return errors

    async def get_invalid_score_keys(self, analysis_id: UUID) -> list[str]:
        session = await self.repo.get_or_create_session(analysis_id)
        scores = await self.repo.list_scores(analysis_id)
        return [
            f"{s.criterion_id}/{s.subject_id}"
            for s in scores
            if not (session.scale_min <= float(s.score) <= session.scale_max)
        ]

    async def calculate_result(self, analysis_id: UUID) -> dict:
        errors = await self.validate_input(analysis_id)
        if errors:
            return {"errors": errors}

        session = await self.repo.get_or_create_session(analysis_id)
        criteria = await self.repo.list_criteria(analysis_id)
        subjects = await self.repo.list_subjects(analysis_id)
        scores = await self.repo.list_scores(analysis_id)

        score_map = {(s.criterion_id, s.subject_id): float(s.score) for s in scores}
        weight_map = {c.id: float(c.weight) for c in criteria}

        raw_results = []
        for subject in subjects:
            subject_scores = [score_map[(c.id, subject.id)] for c in criteria]
            avg_arithmetic = sum(subject_scores) / len(subject_scores)
            avg_weighted = sum(weight_map[c.id] * score_map[(c.id, subject.id)] for c in criteria)
            percentage = avg_weighted / session.scale_max * 100
            raw_results.append({
                "subject_id": subject.id, "subject_name": subject.name,
                "avg_arithmetic": avg_arithmetic, "avg_weighted": avg_weighted, "percentage": percentage,
            })

        ranked = sorted(
            raw_results,
            key=lambda r: (-round(r["percentage"], 2), -r["avg_weighted"], r["subject_name"]),
        )
        for i, r in enumerate(ranked, start=1):
            r["rank"] = i

        await self.repo.save_results(analysis_id, [
            {
                "subject_id": r["subject_id"], "avg_arithmetic": round(r["avg_arithmetic"], 4),
                "avg_weighted": round(r["avg_weighted"], 4), "percentage": round(r["percentage"], 2),
                "rank": r["rank"],
            }
            for r in ranked
        ])

        await self.analyses.mark_completed(analysis_id)

        top_subjects = [r["subject_id"] for r in ranked[:2]]
        return await self._build_state(analysis_id, results=ranked, top_subjects=top_subjects)

    async def get_state(self, analysis_id: UUID) -> dict:
        analysis = await self.analyses.get_by_id(analysis_id)
        results = None
        top_subjects = None
        if analysis.status == "completed":
            saved = await self.repo.list_results(analysis_id)
            subjects_by_id = {s.id: s for s in await self.repo.list_subjects(analysis_id)}
            ranked = sorted(saved, key=lambda r: r.rank)
            results = [{
                "subject_id": r.subject_id, "subject_name": subjects_by_id[r.subject_id].name,
                "avg_arithmetic": float(r.avg_arithmetic), "avg_weighted": float(r.avg_weighted),
                "percentage": float(r.percentage), "rank": r.rank,
            } for r in ranked]
            top_subjects = [r["subject_id"] for r in results[:2]]
        return await self._build_state(analysis_id, results=results, top_subjects=top_subjects)

    async def _build_state(self, analysis_id: UUID, results=None, top_subjects=None) -> dict:
        analysis = await self.analyses.get_by_id(analysis_id)
        session = await self.repo.get_or_create_session(analysis_id)
        criteria = await self.repo.list_criteria(analysis_id)
        subjects = await self.repo.list_subjects(analysis_id)
        scores = await self.repo.list_scores(analysis_id)

        weights_sum = round(sum(float(c.weight) for c in criteria), 4)
        scores_map = {f"{s.criterion_id}/{s.subject_id}": float(s.score) for s in scores}
        invalid = await self.get_invalid_score_keys(analysis_id)

        return {
            "analysis_id": analysis_id, "type": analysis.type,
            "scale_min": session.scale_min, "scale_max": session.scale_max,
            "weights_sum": weights_sum, "criteria": criteria, "subjects": subjects,
            "scores": scores_map, "invalid_scores": invalid,
            "results": results, "top_subjects": top_subjects,
        }

    async def normalize_and_save_criteria(self, analysis_id: UUID) -> list:
        criteria = await self.repo.list_criteria(analysis_id)
        if not criteria:
            return []
        normalized_weights = normalize_weights([float(c.weight) for c in criteria])
        items = [{"name": c.name, "weight": w} for c, w in zip(criteria, normalized_weights)]
        return await self.repo.replace_criteria(analysis_id, items)

    async def export_to_excel(self, analysis_id: UUID, lang: str = "ru") -> bytes:
        from app.services.export_service import export_punktowa_to_excel

        state = await self.get_state(analysis_id)
        return export_punktowa_to_excel(state, lang=lang)
