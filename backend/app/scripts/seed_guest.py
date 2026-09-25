import asyncio
import logging

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.analysis import Analysis
from app.models.user import User
from app.repositories.abc_xyz_repository import AbcXyzRepository
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.audyt_repository import AudytRepository
from app.repositories.eisenhower_repository import EisenhowerRepository
from app.repositories.punktowa_repository import PunktowaRepository
from app.repositories.schedule_repository import ScheduleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.swot import PAIRS_BY_TYPE
from app.services.abc_xyz_service import AbcXyzService
from app.services.audyt_service import AudytService
from app.services.punktowa_service import PunktowaService
from app.services.swot_service import SwotService
from app.utils.security import hash_password

logger = logging.getLogger(__name__)

GUEST_USERNAME = "guest"
GUEST_EMAIL = "guest@guestdemo.io"
GUEST_PASSWORD = "guest12345"
GUEST_FIRST_NAME = "Guest"
GUEST_LAST_NAME = "Demo"
GUEST_COMPANY = "Demo Sp. z o.o."
GUEST_INDUSTRY = "Services"

INDUSTRY_RETAIL = "Retail / Wholesale"
INDUSTRY_IT = "IT & Technology"
INDUSTRY_SALES = "Sales, Procurement"
INDUSTRY_MEDICINE = "Medicine"

GROUP_CODES = {
    "S": [f"S{i}" for i in range(1, 6)],
    "W": [f"W{i}" for i in range(1, 6)],
    "O": [f"O{i}" for i in range(1, 6)],
    "T": [f"T{i}" for i in range(1, 6)],
}

RETAIL_ANSWERS = {
    "S1": 4, "S2": 5, "S3": 3, "S4": 4, "S5": 2,
    "W1": 3, "W2": 4, "W3": 2, "W4": 3, "W5": 5,
    "O1": 5, "O2": 3, "O3": 4, "O4": 1, "O5": 4,
    "T1": 3, "T2": 4, "T3": 5, "T4": 2, "T5": 3,
}

IT_WEIGHTS = {
    "S1": 0.32, "S2": 0.24, "S3": 0.18, "S4": 0.14, "S5": 0.12,
    "W1": 0.22, "W2": 0.21, "W3": 0.20, "W4": 0.19, "W5": 0.18,
    "O1": 0.30, "O2": 0.10, "O3": 0.25, "O4": 0.15, "O5": 0.20,
    "T1": 0.16, "T2": 0.28, "T3": 0.11, "T4": 0.30, "T5": 0.15,
}

MEDICINE_ANSWERS = {
    "S1": 5, "S2": 4, "S3": 3, "S4": 4, "S5": 2,
    "W1": 2, "W2": 3, "W3": 4, "W4": 3, "W5": 5,
    "O1": 4, "O2": 5, "O3": 3, "O4": 4, "O5": 1,
    "T1": 3, "T2": 1, "T3": 4, "T4": 5, "T5": 3,
}

ABC_XYZ_ITEMS = [
    ("MacBook Pro 14\" M4", 452, 60),
    ("iPhone 17 Pro 256GB", 434, 53),
    ("Apple Watch Series 11", 313, 67),
    ("iPhone 16e 256GB", 350, 50),
    ("AirPods Max", 320, 54),
    ("HomePod mini", 332, 49),
    ("Apple Pencil 2", 249, 61),
    ("iPhone 17 256GB", 356, 41),
    ("Apple Watch Ultra 3", 415, 35),
    ("iPad mini 512GB", 220, 59),
    ("iMac 24\" M4", 307, 40),
    ("Apple Watch SE 3", 245, 49),
    ("iPhone 16 128GB", 185, 60),
    ("Mac mini M4", 280, 34),
    ("iPad Air 11\" 1TB", 164, 54),
    ("Magic Keyboard", 238, 37),
    ("iPad 11\" 256GB", 221, 34),
    ("MacBook Pro 16\" M4 Pro", 347, 21),
    ("MacBook Air 13\" M4", 107, 63),
    ("iPad Pro 13\" 1TB", 112, 52),
    ("AirPods Pro 3", 126, 46),
    ("iPhone 17 Air 128GB", 74, 76),
    ("AirTag (4-pack)", 357, 13),
    ("AirPods 4", 292, 12),
    ("iPad Air 11\" 512GB", 74, 47),
    ("MacBook Air 15\" M4", 53, 58),
    ("iPad Pro 13\" 512GB", 156, 13),
    ("iPhone 17 Pro Max 512GB", 64, 31),
    ("Apple TV 4K", 38, 51),
    ("Beats Solo Pro", 45, 42),
]

EISENHOWER_TASKS = [
    ("Zająć się pilną reklamacją kluczowego klienta", 1),
    ("Zaktualizować CRM o nowe leady z targów", 1),
    ("Przygotować spersonalizowaną ofertę dla dużego potencjalnego klienta", 1),
    ("Skończyć miesięczny raport sprzedaży na jutrzejsze spotkanie zarządu", 2),
    ("Odpowiedzieć na rutynowe maile klientów o dostawach", 3),
    ("Zatwierdzić rabaty dla małych zamówień od młodszych przedstawicieli handlowych", 3),
    ("Wziąć udział w opcjonalnym wewnętrznym webinarium o produktywności", 4),
    ("Opracować 6-miesięczną strategię sprzedaży z celami przychodowymi", 4),
    ("Ocenić opłacalność wejścia na nowy rynek zagraniczny", None),
    ("Przeanalizować skuteczność ostatniej kampanii e-mailowej", None),
    ("Zweryfikować rentowność udzielonych rabatów dla 5 największych klientów", None),
]

SCHEDULE_TASKS = [
    ("Sprawdzić i zatwierdzić tygodniowy harmonogram pracy zespołu sprzedażowego",
     "Dyrektor sprzedaży", "2026-07-26", "2026-07-27", 100),
    ("Przeprowadzić cotygodniowe spotkanie zespołu sprzedażowego",
     "Kierownik sprzedaży", "2026-07-28", "2026-07-28", 100),
    ("Wysłać oferty do 10 nowych leadów z ubiegłego tygodnia",
     "Przedstawiciel handlowy (junior)", "2026-07-29", "2026-07-31", 100),
    ("Przygotować prezentację dla kluczowego klienta na środowe spotkanie",
     "Specjalista ds. kluczowych klientów (KAM)", "2026-08-02", "2026-08-04", 100),
    ("Przeanalizować raport konkurencji z ostatniego kwartału i przygotować wnioski",
     "Analityk sprzedaży", "2026-08-05", "2026-08-07", 40),
    ("Wykonać telefony do 3 kluczowych klientów z przypomnieniem o końcu umowy",
     "Opiekun klienta (CSM)", "2026-08-08", "2026-08-11", 0),
    ("Opracować listę priorytetowych celów sprzedażowych na nadchodzący miesiąc",
     "Dyrektor sprzedaży", "2026-08-12", "2026-08-13", 0),
]

PUNKTOWA_SUPPLIERS_CRITERIA = [
    ("Terminowość płatności", 0.12),
    ("Wielkość kontraktu", 0.08),
    ("Koszt usług", 0.10),
    ("Skalowalność", 0.11),
    ("Niezawodność i dostępność usług", 0.02),
    ("Bezpieczeństwo danych", 0.10),
    ("Wsparcie techniczne", 0.06),
    ("Integracja z ekosystemem Apple", 0.12),
    ("Usługi analityczne i AI", 0.07),
    ("Globalna dostępność", 0.08),
    ("Elastyczność umów i SLA", 0.07),
    ("Renoma i doświadczenie dostawcy", 0.07),
]
PUNKTOWA_SUPPLIERS_SUBJECTS = [
    "Amazon Web Services (AWS)", "Microsoft Azure", "Google Cloud Platform (GCP)",
    "IBM Cloud", "Oracle Cloud Infrastructure (OCI)", "Alibaba Cloud", "DigitalOcean",
]
PUNKTOWA_SUPPLIERS_SCORES = [
    [4, 2, 3, 5, 1, 2, 3],
    [4, 3, 2, 1, 5, 3, 4],
    [2, 3, 1, 2, 4, 3, 5],
    [4, 2, 3, 4, 3, 4, 5],
    [3, 5, 5, 4, 5, 3, 2],
    [3, 1, 2, 1, 4, 3, 5],
    [4, 3, 2, 1, 3, 2, 4],
    [5, 3, 4, 2, 3, 1, 2],
    [4, 3, 5, 4, 2, 3, 4],
    [1, 3, 2, 4, 4, 3, 2],
    [3, 2, 3, 4, 5, 4, 5],
    [3, 2, 1, 3, 2, 4, 1],
]

PUNKTOWA_CLIENTS_CRITERIA = [
    ("Terminowość płatności", 0.15),
    ("Wielkość kontraktu", 0.12),
    ("Stabilność zamówień", 0.10),
    ("Perspektywa długofalowej współpracy", 0.14),
    ("Znaczenie strategiczne dla firmy", 0.13),
    ("Skala wykorzystania usług informacyjnych", 0.04),
    ("Potencjał rozwoju współpracy", 0.09),
    ("Współpraca technologiczna", 0.07),
    ("Poziom wsparcia posprzedażowego", 0.05),
    ("Renoma i wiarygodność klienta", 0.11),
]
PUNKTOWA_CLIENTS_SUBJECTS = [
    "Verizon", "Pomeroy", "Lensa", "Mandli Communications",
    "Neuralink", "Service Express", "IBM",
]
PUNKTOWA_CLIENTS_SCORES = [
    [4, 2, 3, 5, 5, 4, 3],
    [3, 1, 3, 5, 4, 5, 2],
    [1, 2, 4, 3, 1, 5, 2],
    [4, 1, 2, 3, 1, 5, 4],
    [2, 3, 4, 5, 2, 3, 4],
    [1, 2, 3, 4, 5, 4, 5],
    [3, 4, 3, 1, 2, 4, 2],
    [5, 3, 4, 1, 3, 2, 4],
    [3, 4, 2, 3, 5, 1, 2],
    [1, 2, 4, 4, 2, 3, 5],
]

AUDYT_CRITERIA_COMMON = [
    "Polityka jakości usług chmurowych",
    "Planowanie i zarządzanie jakością usług",
    "Dokumentacja procesów i procedur",
    "Zarządzanie bezpieczeństwem informacji",
    "Zarządzanie dostępnością i ciągłością usługi",
    "Zarządzanie incydentami i problemami",
    "Zarządzanie zmianami",
    "Kompetencje i szkolenia personelu",
    "Monitorowanie jakości usług i raportowanie",
    "Ciągłe doskonalenie usług",
]
AUDYT_POSITIVE_SCORES = [
    [6, 4, 7, 6, 6, 9, 9, 6, 5, 3],
    [4, 10, 3, 9, 3, 6, 6, 7, 7, 5],
    [8, 3, 2, 10, 1, 8, 7, 3, 9, 8],
    [9, 8, 9, 10, 8, 10, 9, 4, 8, 9],
    [2, 5, 8, 8, 7, 8, 8, 1, 10, 6],
]
AUDYT_NEGATIVE_SCORES = [
    [3, 9, 2, 2, 1, 7],
    [4, 9, 3, 9, 5, 5],
    [2, 2, 5, 7, 8, 8],
    [6, 6, 7, 4, 7, 9],
    [8, 4, 3, 2, 2, 8],
]


async def get_or_create_guest_user(db: AsyncSession) -> User:
    users = UserRepository(db)
    user = await users.get_by_username(GUEST_USERNAME)
    if user is None:
        user = await users.create(
            email=GUEST_EMAIL,
            username=GUEST_USERNAME,
            password_hash=hash_password(GUEST_PASSWORD),
            first_name=GUEST_FIRST_NAME,
            last_name=GUEST_LAST_NAME,
        )
    else:
        user = await users.update(
            user.id, email=GUEST_EMAIL,
            first_name=GUEST_FIRST_NAME, last_name=GUEST_LAST_NAME,
        )
    await users.update_profile(
        user.id,
        company_name=GUEST_COMPANY,
        industry=GUEST_INDUSTRY,
        company_size="medium",
        position="Demo",
    )
    return await users.get_by_id(user.id)


async def wipe_guest_analyses(db: AsyncSession, user: User) -> None:
    await db.execute(delete(Analysis).where(Analysis.user_id == user.id))
    await db.commit()


async def _next_title(analyses: AnalysisRepository, user: User, type_: str, label: str) -> str:
    count = await analyses.count_by_type(user.id, type_)
    return f"{label} #{count + 1}"


def _fill_pair(weight_map: dict[str, float], pair: str) -> list[list[int]]:
    row_group, col_group = pair.split("/")
    row_codes = GROUP_CODES[row_group]
    col_codes = GROUP_CODES[col_group]
    sums = [[weight_map[r] + weight_map[c] for c in col_codes] for r in row_codes]
    flat = sorted(v for row in sums for v in row)
    threshold = flat[len(flat) // 2]
    return [[1 if v >= threshold else 0 for v in row] for row in sums]


async def _fill_swot_matrix(service: SwotService, analysis_id, pairs: list[str]) -> None:
    row = await service.repo.get(analysis_id)
    weight_map = {
        f["code"]: f["weight"]
        for group in (row.s_scores, row.w_scores, row.o_scores, row.t_scores)
        for f in group
    }
    cells = {pair: _fill_pair(weight_map, pair) for pair in pairs}
    await service.repo.merge_criteria(analysis_id, cells)


async def seed_swot_examples(db: AsyncSession, user: User) -> None:
    analyses = AnalysisRepository(db)
    service = SwotService(db)
    guest_name = f"{user.first_name} {user.last_name}"

    swot_analysis = await analyses.create(
        user_id=user.id, type="swot",
        title=await _next_title(analyses, user, "swot", "SWOT"),
        status="in_progress", snapshot_name=guest_name, snapshot_company=GUEST_COMPANY,
        snapshot_industry=INDUSTRY_RETAIL,
    )
    await service.process_answers(swot_analysis.id, RETAIL_ANSWERS, INDUSTRY_RETAIL)
    await _fill_swot_matrix(service, swot_analysis.id, sorted(PAIRS_BY_TYPE["swot"]))
    await service.calculate_result(swot_analysis.id)

    tows_analysis = await analyses.create(
        user_id=user.id, type="tows",
        title=await _next_title(analyses, user, "tows", "TOWS"),
        status="in_progress", snapshot_name=guest_name, snapshot_company=GUEST_COMPANY,
        snapshot_industry=INDUSTRY_IT,
    )
    await service.process_manual_weights(tows_analysis.id, IT_WEIGHTS, INDUSTRY_IT)
    await _fill_swot_matrix(service, tows_analysis.id, sorted(PAIRS_BY_TYPE["tows"]))
    await service.calculate_result(tows_analysis.id)

    st_analysis = await analyses.create(
        user_id=user.id, type="swot-tows",
        title=await _next_title(analyses, user, "swot-tows", "SWOT-TOWS"),
        status="in_progress", snapshot_name=guest_name, snapshot_company=GUEST_COMPANY,
        snapshot_industry=INDUSTRY_MEDICINE,
    )
    await service.process_answers(st_analysis.id, MEDICINE_ANSWERS, INDUSTRY_MEDICINE)
    await _fill_swot_matrix(service, st_analysis.id, sorted(PAIRS_BY_TYPE["swot-tows"]))
    await service.calculate_result(st_analysis.id)


async def seed_abc_xyz(db: AsyncSession, user: User) -> None:
    analyses = AnalysisRepository(db)
    analysis = await analyses.create(
        user_id=user.id, type="abc-xyz",
        title=await _next_title(analyses, user, "abc-xyz", "ABC/XYZ"),
        status="in_progress",
        snapshot_name=f"{user.first_name} {user.last_name}", snapshot_company=GUEST_COMPANY,
        snapshot_industry=INDUSTRY_RETAIL,
    )
    repo = AbcXyzRepository(db)
    await repo.set_period_label(analysis.id, "Q3 2026")
    await repo.replace_items(analysis.id, [
        {"name": name, "quantity": qty, "unit_cost": cost}
        for name, qty, cost in ABC_XYZ_ITEMS
    ])
    service = AbcXyzService(db)
    await service.calculate_result(analysis.id)


async def seed_eisenhower(db: AsyncSession, user: User) -> None:
    analyses = AnalysisRepository(db)
    analysis = await analyses.create(
        user_id=user.id, type="eisenhower",
        title=await _next_title(analyses, user, "eisenhower", "eisenhower"),
        status="in_progress",
        snapshot_name=f"{user.first_name} {user.last_name}", snapshot_company=GUEST_COMPANY,
        snapshot_industry=INDUSTRY_SALES,
    )
    repo = EisenhowerRepository(db)
    for title, quadrant in EISENHOWER_TASKS:
        await repo.create_task(analysis.id, title=title, quadrant=quadrant)
    from app.services.eisenhower_service import EisenhowerService
    await EisenhowerService(db).calculate_result(analysis.id)


async def seed_schedule(db: AsyncSession, user: User) -> None:
    from datetime import date as date_cls

    analyses = AnalysisRepository(db)
    analysis = await analyses.create(
        user_id=user.id, type="schedule",
        title=await _next_title(analyses, user, "schedule", "schedule"),
        status="in_progress",
        snapshot_name=f"{user.first_name} {user.last_name}", snapshot_company=GUEST_COMPANY,
        snapshot_industry=INDUSTRY_SALES,
    )
    repo = ScheduleRepository(db)
    for title, responsible, start, end, progress in SCHEDULE_TASKS:
        await repo.create_task(
            analysis.id, title=title, responsible=responsible,
            start_date=date_cls.fromisoformat(start), end_date=date_cls.fromisoformat(end),
            progress=progress,
        )
    from app.services.schedule_service import ScheduleService
    await ScheduleService(db).calculate_result(analysis.id)


async def _seed_punktowa(
    db: AsyncSession, user: User, analysis_type: str,
    criteria: list[tuple[str, float]], subjects: list[str], scores: list[list[int]],
) -> None:
    analyses = AnalysisRepository(db)
    analysis = await analyses.create(
        user_id=user.id, type=analysis_type,
        title=await _next_title(analyses, user, analysis_type, analysis_type),
        status="in_progress",
        snapshot_name=f"{user.first_name} {user.last_name}", snapshot_company=GUEST_COMPANY,
        snapshot_industry=INDUSTRY_IT,
    )
    repo = PunktowaRepository(db)
    criteria_rows = await repo.replace_criteria(
        analysis.id, [{"name": name, "weight": weight} for name, weight in criteria]
    )
    subject_rows = await repo.replace_subjects(analysis.id, subjects)
    cells = [
        {"criterion_id": criteria_rows[ci].id, "subject_id": subject_rows[si].id, "score": scores[ci][si]}
        for ci in range(len(criteria_rows))
        for si in range(len(subject_rows))
    ]
    await repo.upsert_scores(analysis.id, cells)
    await PunktowaService(db).calculate_result(analysis.id)


async def seed_punktowa_examples(db: AsyncSession, user: User) -> None:
    await _seed_punktowa(
        db, user, "punktowa-dostawcy",
        PUNKTOWA_SUPPLIERS_CRITERIA, PUNKTOWA_SUPPLIERS_SUBJECTS, PUNKTOWA_SUPPLIERS_SCORES,
    )
    await _seed_punktowa(
        db, user, "punktowa-odbiorcy",
        PUNKTOWA_CLIENTS_CRITERIA, PUNKTOWA_CLIENTS_SUBJECTS, PUNKTOWA_CLIENTS_SCORES,
    )


async def _seed_audyt(
    db: AsyncSession, user: User, criteria_names: list[str], scores: list[list[int]],
) -> None:
    from decimal import Decimal

    analyses = AnalysisRepository(db)
    analysis = await analyses.create(
        user_id=user.id, type="audyt",
        title=await _next_title(analyses, user, "audyt", "audyt"),
        status="in_progress",
        snapshot_name=f"{user.first_name} {user.last_name}", snapshot_company=GUEST_COMPANY,
        snapshot_industry=INDUSTRY_IT,
    )
    repo = AudytRepository(db)
    await repo.update_session(
        analysis.id, scale_min=1, scale_max=10, num_auditors=5,
        score_red_threshold=Decimal("6"),
        criterion_acceptance_pct=Decimal("59"), system_acceptance_pct=Decimal("55"),
    )
    criteria_rows = await repo.set_criteria(analysis.id, criteria_names)
    scores_data = [
        {"criterion_id": criteria_rows[ci].id, "auditor_number": auditor + 1, "score": Decimal(str(scores[auditor][ci]))}
        for ci in range(len(criteria_rows))
        for auditor in range(len(scores))
    ]
    await repo.bulk_upsert_scores(analysis.id, scores_data)
    await AudytService(repo).calculate_and_save(analysis.id)
    await analyses.mark_completed(analysis.id)


async def seed_audyt_examples(db: AsyncSession, user: User) -> None:
    await _seed_audyt(db, user, AUDYT_CRITERIA_COMMON, AUDYT_POSITIVE_SCORES)
    await _seed_audyt(db, user, AUDYT_CRITERIA_COMMON[:6], AUDYT_NEGATIVE_SCORES)


async def reset_guest_data(db: AsyncSession) -> User:
    user = await get_or_create_guest_user(db)
    await wipe_guest_analyses(db, user)
    await seed_swot_examples(db, user)
    await seed_abc_xyz(db, user)
    await seed_eisenhower(db, user)
    await seed_schedule(db, user)
    await seed_punktowa_examples(db, user)
    await seed_audyt_examples(db, user)
    return user


async def ensure_guest_seeded(db: AsyncSession) -> bool:
    users = UserRepository(db)
    user = await users.get_by_username(GUEST_USERNAME)
    if user is not None:
        analyses = AnalysisRepository(db)
        existing = await analyses.list_all(user_id=user.id)
        if existing:
            return False
    await reset_guest_data(db)
    return True


async def main() -> None:
    async with AsyncSessionLocal() as db:
        user = await reset_guest_data(db)
        logger.info("guest seeded: %s / %s analyses reset", user.username, user.id)


if __name__ == "__main__":
    asyncio.run(main())
