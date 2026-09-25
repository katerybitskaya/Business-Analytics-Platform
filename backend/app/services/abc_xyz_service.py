import statistics
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.base_service import AnalysisService
from app.models.abc_xyz import AbcXyzItem
from app.repositories.abc_xyz_repository import AbcXyzRepository
from app.repositories.analysis_repository import AnalysisRepository

_CATEGORY_TEXT: dict[str, dict[tuple[str, str], str]] = {
    "ru": {
        ("A", "X"): "Высокая ценность / Низкая изменчивость",
        ("A", "Y"): "Высокая ценность / Средняя изменчивость",
        ("A", "Z"): "Высокая ценность / Высокая изменчивость",
        ("B", "X"): "Средняя ценность / Низкая изменчивость",
        ("B", "Y"): "Средняя ценность / Средняя изменчивость",
        ("B", "Z"): "Средняя ценность / Высокая изменчивость",
        ("C", "X"): "Низкая ценность / Низкая изменчивость",
        ("C", "Y"): "Низкая ценность / Средняя изменчивость",
        ("C", "Z"): "Низкая ценность / Высокая изменчивость",
    },
    "pl": {
        ("A", "X"): "Wysoka wartość / Niska zmienność",
        ("A", "Y"): "Wysoka wartość / Średnia zmienność",
        ("A", "Z"): "Wysoka wartość / Wysoka zmienność",
        ("B", "X"): "Średnia wartość / Niska zmienność",
        ("B", "Y"): "Średnia wartość / Średnia zmienność",
        ("B", "Z"): "Średnia wartość / Wysoka zmienność",
        ("C", "X"): "Niska wartość / Niska zmienność",
        ("C", "Y"): "Niska wartość / Średnia zmienność",
        ("C", "Z"): "Niska wartość / Wysoka zmienność",
    },
    "en": {
        ("A", "X"): "High value / Low variability",
        ("A", "Y"): "High value / Medium variability",
        ("A", "Z"): "High value / High variability",
        ("B", "X"): "Medium value / Low variability",
        ("B", "Y"): "Medium value / Medium variability",
        ("B", "Z"): "Medium value / High variability",
        ("C", "X"): "Low value / Low variability",
        ("C", "Y"): "Low value / Medium variability",
        ("C", "Z"): "Low value / High variability",
    },
}


def category_text(abc_class: str | None, xyz_class: str | None, lang: str = "ru") -> str | None:
    if not abc_class or not xyz_class:
        return None
    table = _CATEGORY_TEXT.get(lang, _CATEGORY_TEXT["ru"])
    return table.get((abc_class, xyz_class))


def apply_category_lang(items: list[AbcXyzItem], lang: str = "ru") -> None:
    for item in items:
        item.category = category_text(item.abc_class, item.xyz_class, lang)


def _classify_abc(cumulative_pct: float, thresholds: dict) -> str:
    if cumulative_pct <= thresholds.get("a", 0.70):
        return "A"
    if cumulative_pct <= thresholds.get("b", 0.90):
        return "B"
    return "C"


def _classify_xyz(cv: float) -> str:
    if cv < 0.3:
        return "X"
    if cv < 0.5:
        return "Y"
    return "Z"


def compute_abc_xyz(items: list[AbcXyzItem], thresholds: dict) -> None:
    if not items:
        return

    for item in items:
        item.sales_value = float(item.quantity) * float(item.unit_cost)

    total = sum(item.sales_value for item in items) or 1.0

    for item in items:
        item.share_pct = item.sales_value / total

    sorted_items = sorted(items, key=lambda i: i.sales_value, reverse=True)

    cumulative = 0.0
    for item in sorted_items:
        cumulative += item.share_pct
        item.cumulative_pct = cumulative

    n = len(sorted_items)
    for idx, item in enumerate(sorted_items):
        window = [sorted_items[j].sales_value for j in range(idx, n)]
        if len(window) > 1:
            try:
                cv = statistics.stdev(window) / statistics.mean(window)
            except (statistics.StatisticsError, ZeroDivisionError):
                cv = 0.0
        else:
            cv = 0.0
        item.cv = cv

    for item in sorted_items:
        item.abc_class = _classify_abc(item.cumulative_pct, thresholds)
        item.xyz_class = _classify_xyz(item.cv)


def build_matrix(items: list[AbcXyzItem]) -> list[dict]:
    cells: dict[tuple[str, str], list[str]] = {}
    for a in ("A", "B", "C"):
        for x in ("X", "Y", "Z"):
            cells[(a, x)] = []

    for item in items:
        if item.abc_class and item.xyz_class:
            cells[(item.abc_class, item.xyz_class)].append(item.name)

    return [
        {"abc_class": a, "xyz_class": x, "items": names}
        for (a, x), names in cells.items()
    ]


class AbcXyzService(AnalysisService):
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = AbcXyzRepository(db)
        self.analyses = AnalysisRepository(db)

    async def validate_input(self, analysis_id: UUID) -> list[str]:
        items = await self.repo.list_items(analysis_id)
        if not items:
            return ["abc_xyz_no_items"]
        return []

    async def calculate_result(self, analysis_id: UUID, lang: str = "ru") -> dict:
        errors = await self.validate_input(analysis_id)
        if errors:
            return {"errors": errors}

        items = await self.repo.list_items(analysis_id)
        session = await self.repo.get_or_create_session(analysis_id)

        compute_abc_xyz(items, session.abc_thresholds)
        await self.repo.save_calculated_items(items)
        analysis = await self.analyses.mark_completed(analysis_id)

        apply_category_lang(items, lang)
        matrix = build_matrix(items)
        return {
            "analysis_id": analysis_id,
            "period_label": session.period_label,
            "items": items,
            "matrix": matrix,
            "title": analysis.title if analysis else None,
            "created_at": analysis.created_at.isoformat() if analysis and analysis.created_at else None,
        }

    async def export_to_excel(self, analysis_id: UUID, lang: str = "ru") -> bytes:
        from app.services.export_service import export_abc_xyz_to_excel

        items = await self.repo.list_items(analysis_id)
        session = await self.repo.get_or_create_session(analysis_id)
        apply_category_lang(items, lang)
        matrix = build_matrix(items)
        return export_abc_xyz_to_excel(items, matrix, session.period_label, lang=lang)
