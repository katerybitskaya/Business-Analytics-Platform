import asyncio
import logging
import os
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.core.logging_config import setup_logging
from app.database import AsyncSessionLocal
from app.middleware.logging_middleware import RequestLoggingMiddleware
from app.middleware.rate_limit_middleware import RateLimitMiddleware
from app.routers import abc_xyz, audyt, auth, eisenhower, punktowa, schedule, swot, users, ws
from app.routers import logs as client_logs

logger = logging.getLogger(__name__)
settings = get_settings()

setup_logging(debug=settings.app_debug)

app = FastAPI(
    title="Business Analytics Platform API",
    description="SWOT/TOWS, ABC/XYZ, Эйзенхауэр, Гармонограмма, Analiza punktowa, Audyt",
    version="0.2.0",
    debug=settings.app_debug,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestLoggingMiddleware)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(abc_xyz.router, prefix="/api/analyses/abc-xyz", tags=["abc-xyz"])
app.include_router(swot.router, prefix="/api/analyses/swot", tags=["swot"])
app.include_router(eisenhower.router, prefix="/api/analyses/eisenhower", tags=["eisenhower"])
app.include_router(schedule.router, prefix="/api/analyses/schedule", tags=["schedule"])
app.include_router(punktowa.router, prefix="/api/analyses/punktowa", tags=["punktowa"])
app.include_router(audyt.router, prefix="/api/analyses/audyt", tags=["audyt"])
app.include_router(client_logs.router, prefix="/api/logs", tags=["logs"])
app.include_router(ws.router, prefix="/api/ws", tags=["ws"])

os.makedirs("uploads/avatars", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}


async def _guest_reset_loop() -> None:
    from app.core.ws_manager import manager
    from app.scripts.seed_guest import reset_guest_data

    while True:
        now = datetime.now()
        next_run = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        await asyncio.sleep((next_run - now).total_seconds())
        try:
            async with AsyncSessionLocal() as db:
                user = await reset_guest_data(db)
            logger.info("guest_reset_completed user_id=%s", user.id)
            await manager.send_to_user(user.id, {"type": "guest_reset"})
        except Exception:
            logger.exception("guest_reset_failed")


@app.on_event("startup")
async def _startup_guest_seed() -> None:
    from app.scripts.seed_guest import ensure_guest_seeded

    async with AsyncSessionLocal() as db:
        seeded = await ensure_guest_seeded(db)
    logger.info("guest_startup_seed_checked seeded=%s", seeded)
    asyncio.create_task(_guest_reset_loop())
