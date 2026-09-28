from pathlib import Path

ROOT = Path(SPECPATH)
BACKEND_DIR = ROOT.parent / "backend"
FRONTEND_DIST = ROOT.parent / "frontend" / "dist"

a = Analysis(
    ["desktop_app.py"],
    pathex=[str(BACKEND_DIR)],
    binaries=[],
    datas=[
        (str(FRONTEND_DIST), "frontend_dist"),
        (str(ROOT / ".env.desktop.example"), "."),
    ],
    hiddenimports=[
        "aiosqlite",
        "greenlet",
        "passlib.handlers.bcrypt",
        "email_validator",
        "aiosmtplib",
        "jose",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="BusinessAnalyticsPlatform",
    debug=False,
    strip=False,
    upx=True,
    runtime_tmpdir=None,
    console=False,
    icon=str(ROOT / "assets" / "icon.ico"),
)
