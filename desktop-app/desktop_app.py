import os
import secrets
import shutil
import socket
import sys
import threading
import time
import urllib.request
from pathlib import Path


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def project_root() -> Path:
    return Path(__file__).resolve().parent


def get_frontend_dist() -> Path:
    if is_frozen():
        base = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
        return base / "frontend_dist"
    return project_root().parent / "frontend" / "dist"


def get_env_template() -> Path:
    if is_frozen():
        base = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
        return base / ".env.desktop.example"
    return project_root() / ".env.desktop.example"


def app_data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA")
    data_dir = Path(base) / "BusinessAnalyticsPlatform" if base else Path.home() / ".business-analytics-platform"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def ensure_env_file(env_path: Path) -> None:
    if env_path.exists():
        return
    shutil.copyfile(get_env_template(), env_path)
    text = env_path.read_text(encoding="utf-8")
    text = text.replace("GENERATE_ON_FIRST_RUN", secrets.token_hex(32))
    env_path.write_text(text, encoding="utf-8")


def read_env_value(env_path: Path, key: str) -> str:
    prefix = f"{key}="
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith(prefix):
            value = line[len(prefix):].strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            return value
    return ""


def find_free_port(preferred: int = 8723) -> int:
    for port in (preferred, *range(8724, 8740)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("No free port found")


def run_server(fastapi_app, port: int) -> None:
    import uvicorn

    config = uvicorn.Config(fastapi_app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()


def wait_until_up(port: int, timeout: float = 20.0) -> bool:
    url = f"http://127.0.0.1:{port}/api/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.3)
    return False


def mount_frontend(fastapi_app, dist_dir: Path) -> None:
    from fastapi.staticfiles import StaticFiles

    fastapi_app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")


async def create_sqlite_schema() -> None:
    from app.database import Base, engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def main() -> None:
    data_dir = app_data_dir()
    env_path = data_dir / ".env"
    ensure_env_file(env_path)

    os.chdir(data_dir)
    os.environ["ENV_FILE"] = str(env_path)

    if not is_frozen():
        sys.path.insert(0, str(project_root().parent / "backend"))

    database_url = read_env_value(env_path, "DATABASE_URL")
    if database_url.startswith("sqlite"):
        import sqlite_compat

        sqlite_compat.apply()

    from app.main import app as fastapi_app  # noqa: E402

    if database_url.startswith("sqlite"):
        import asyncio

        asyncio.run(create_sqlite_schema())

    mount_frontend(fastapi_app, get_frontend_dist())

    port = find_free_port()
    run_server(fastapi_app, port)
    wait_until_up(port)

    import webview

    webview.create_window(
        "Business Analytics Platform",
        f"http://127.0.0.1:{port}",
        width=1440,
        height=900,
        min_size=(1024, 640),
        resizable=True,
    )
    webview.start()


if __name__ == "__main__":
    main()
