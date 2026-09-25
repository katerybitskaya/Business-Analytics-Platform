from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.base_service import AnalysisService
from app.models.user import User
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.swot_repository import SwotRepository
from app.schemas.swot import PAIRS_BY_TYPE

_STRATEGY_PAIRS = [
    ("agresywna",      ["S/O", "O/S"]),
    ("konserwatywna",  ["S/T", "T/S"]),
    ("konkurencyjna",  ["W/O", "O/W"]),
    ("defensywna",     ["W/T", "T/W"]),
]

WEIGHT_SUM_TOLERANCE = 0.005


def _weight_map(factors: list[dict]) -> dict[str, float]:
    return {f["code"]: f["weight"] for f in (factors or [])}


def compute_pair_nsr(pair: str, grid: list[list[int]],
                     weights_row: dict[str, float], weights_col: dict[str, float],
                     row_codes: list[str], col_codes: list[str]) -> dict:
    rows_nsr = []
    for i, code in enumerate(row_codes):
        n = sum(grid[i]) if i < len(grid) else 0
        s = round(weights_row.get(code, 0) * n, 4)
        rows_nsr.append({"code": code, "n": n, "s": s})

    cols_nsr = []
    for j, code in enumerate(col_codes):
        n = sum(grid[i][j] for i in range(len(grid)) if j < len(grid[i]))
        s = round(weights_col.get(code, 0) * n, 4)
        cols_nsr.append({"code": code, "n": n, "s": s})

    for rank, item in enumerate(sorted(rows_nsr, key=lambda x: x["s"], reverse=True), start=1):
        item["r"] = rank

    for rank, item in enumerate(sorted(cols_nsr, key=lambda x: x["s"], reverse=True), start=1):
        item["r"] = rank

    all_items = rows_nsr + cols_nsr
    total_n = sum(x["n"] for x in all_items)
    total_s = round(sum(x["s"] for x in all_items), 4)

    return {
        "pair":    pair,
        "rows":    rows_nsr,
        "cols":    cols_nsr,
        "total_n": total_n,
        "total_s": total_s,
    }


def compute_all_nsr(criteria: dict, s_factors, w_factors, o_factors, t_factors) -> dict:
    wmap = {
        "S": _weight_map(s_factors), "W": _weight_map(w_factors),
        "O": _weight_map(o_factors), "T": _weight_map(t_factors),
    }
    codes = {
        "S": [f"S{i}" for i in range(1, 6)],
        "W": [f"W{i}" for i in range(1, 6)],
        "O": [f"O{i}" for i in range(1, 6)],
        "T": [f"T{i}" for i in range(1, 6)],
    }
    result = {}
    for pair, grid in (criteria or {}).items():
        if "/" not in pair:
            continue
        rg, cg = pair.split("/")
        if rg not in wmap or cg not in wmap:
            continue
        result[pair] = compute_pair_nsr(
            pair, grid,
            wmap[rg], wmap[cg],
            codes[rg], codes[cg],
        )
    return result


def compute_strategy_quadrants(nsr: dict) -> list[dict]:
    results = []
    for name, tables in _STRATEGY_PAIRS:
        total_n = sum(nsr[t]["total_n"] for t in tables if t in nsr)
        total_s = round(sum(nsr[t]["total_s"] for t in tables if t in nsr), 4)
        results.append({
            "name": name, "tables": tables,
            "total_n": total_n, "total_s": total_s,
        })
    return results


class SwotService(AnalysisService):
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = SwotRepository(db)
        self.analyses = AnalysisRepository(db)

    async def validate_input(self, analysis_id: UUID) -> list[str]:
        analysis = await self.analyses.get_by_id(analysis_id)
        row = await self.repo.get(analysis_id)
        errors = []
        if not row or not row.s_scores or not row.w_scores or not row.o_scores or not row.t_scores:
            errors.append("swot_answers_required")
            return errors
        for label, factors in (("S", row.s_scores), ("W", row.w_scores),
                                ("O", row.o_scores), ("T", row.t_scores)):
            total = sum(float(f.get("weight", 0)) for f in factors)
            if abs(total - 1.0) > WEIGHT_SUM_TOLERANCE:
                errors.append(f"weights_sum_must_be_1: group={label} (сейчас {total:.3f})")
        required = PAIRS_BY_TYPE[analysis.type]
        filled = set((row.criteria or {}).keys())
        missing = required - filled
        if missing:
            errors.append(f"missing_matrix_pairs: {sorted(missing)}")
        return errors

    async def process_answers(self, analysis_id: UUID, answers: dict[str, int],
                              industry: str | None) -> dict:
        from app.data.swot_questions import calculate_weights, ACTIVITY_MAP
        weights = calculate_weights(answers)
        activity = ACTIVITY_MAP.get(industry or "", None) if industry else None
        await self.repo.save_factors(
            analysis_id, activity,
            weights["s"], weights["w"], weights["o"], weights["t"],
            mode="questionnaire",
        )
        row = await self.repo.get_or_create(analysis_id)
        row.user_answers = answers
        await self.repo.db.commit()
        return await self.get_state(analysis_id)

    async def process_manual_weights(self, analysis_id: UUID, weights: dict[str, float],
                                     industry: str | None) -> dict:
        from app.data.swot_questions import ACTIVITY_MAP
        groups = {
            "s": ["S1", "S2", "S3", "S4", "S5"],
            "w": ["W1", "W2", "W3", "W4", "W5"],
            "o": ["O1", "O2", "O3", "O4", "O5"],
            "t": ["T1", "T2", "T3", "T4", "T5"],
        }
        activity = ACTIVITY_MAP.get(industry or "", None) if industry else None
        factors = {
            grp: [{"code": code, "weight": round(float(weights.get(code, 0) or 0), 2)} for code in codes]
            for grp, codes in groups.items()
        }
        await self.repo.save_factors(
            analysis_id, activity,
            factors["s"], factors["w"], factors["o"], factors["t"],
            mode="manual",
        )
        row = await self.repo.get_or_create(analysis_id)
        row.manual_weights = {code: round(float(w), 2) for code, w in weights.items() if w}
        await self.repo.db.commit()
        return await self.get_state(analysis_id)

    async def calculate_result(self, analysis_id: UUID) -> dict:
        errors = await self.validate_input(analysis_id)
        if errors:
            return {"errors": errors}
        row = await self.repo.get(analysis_id)
        await self.analyses.mark_completed(analysis_id)
        analysis = await self.analyses.get_by_id(analysis_id)

        nsr = compute_all_nsr(
            row.criteria, row.s_scores, row.w_scores, row.o_scores, row.t_scores
        )
        out = self._build_state(analysis, row, nsr)
        return out

    async def get_state(self, analysis_id: UUID) -> dict:
        analysis = await self.analyses.get_by_id(analysis_id)
        row = await self.repo.get_or_create(analysis_id)
        nsr = compute_all_nsr(
            row.criteria, row.s_scores, row.w_scores, row.o_scores, row.t_scores
        )
        return self._build_state(analysis, row, nsr)

    def _build_state(self, analysis, row, nsr: dict) -> dict:
        criteria = row.criteria or {}
        out = {
            "analysis_id": analysis.id,
            "type": analysis.type,
            "status": analysis.status,
            "activity": row.activity,
            "snapshot_industry": analysis.snapshot_industry,
            "title": analysis.title,
            "created_at": analysis.created_at.isoformat() if analysis.created_at else None,
            "mode": row.mode,
            "user_answers": row.user_answers,
            "manual_weights": row.manual_weights,
            "s_factors": row.s_scores or [],
            "w_factors": row.w_scores or [],
            "o_factors": row.o_scores or [],
            "t_factors": row.t_scores or [],
            "criteria": criteria,
            "nsr": nsr,
            "required_pairs": sorted(PAIRS_BY_TYPE[analysis.type]),
            "filled_pairs": sorted(criteria.keys()),
            "strategy": None,
            "dominant_strategy": None,
        }
        if analysis.type == "swot-tows" and nsr:
            strategy = compute_strategy_quadrants(nsr)
            out["strategy"] = strategy
            if any(s["total_s"] for s in strategy):
                out["dominant_strategy"] = max(strategy, key=lambda s: s["total_s"])["name"]
        return out

    async def create_extended_analysis(self, source_analysis_id: UUID, user: User) -> dict:
        source_analysis = await self.analyses.get_owned_by_id(source_analysis_id, user.id)
        if not source_analysis:
            raise ValueError("source_analysis_not_found")
        if source_analysis.type not in ("swot", "tows"):
            raise ValueError("only_swot_or_tows_can_be_extended")
        if source_analysis.status != "completed":
            raise ValueError("source_analysis_must_be_completed")
        source_row = await self.repo.get(source_analysis_id)
        if not source_row:
            raise ValueError("source_analysis_has_no_data")

        count = await self.analyses.count_by_type(user.id, "swot-tows")
        new_analysis = await self.analyses.create(
            user_id=user.id, type="swot-tows",
            title=f"SWOT-TOWS #{count + 1}", status="in_progress",
            snapshot_name=source_analysis.snapshot_name,
            snapshot_company=source_analysis.snapshot_company,
            snapshot_industry=source_analysis.snapshot_industry,
            extends_analysis_id=source_analysis.id,
        )
        await self.repo.save_factors(
            new_analysis.id, source_row.activity,
            source_row.s_scores, source_row.w_scores,
            source_row.o_scores, source_row.t_scores,
            mode=source_row.mode,
        )
        if source_row.user_answers or source_row.manual_weights:
            new_row = await self.repo.get_or_create(new_analysis.id)
            if source_row.user_answers:
                new_row.user_answers = source_row.user_answers
            if source_row.manual_weights:
                new_row.manual_weights = source_row.manual_weights
            await self.db.commit()
        await self.repo.merge_criteria(new_analysis.id, dict(source_row.criteria or {}))
        required = PAIRS_BY_TYPE["swot-tows"]
        filled = set((source_row.criteria or {}).keys())
        return {"new_analysis_id": new_analysis.id, "missing_pairs": sorted(required - filled)}

    async def export_to_excel(self, analysis_id: UUID, lang: str = "ru") -> bytes:
        from app.services.export_service import export_swot_to_excel
        result = await self.get_state(analysis_id)
        return export_swot_to_excel(result, lang=lang)
