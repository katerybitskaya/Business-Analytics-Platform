import logging
import logging.handlers
from datetime import date
from pathlib import Path


_PROJECT_ROOT = Path(__file__).resolve().parents[3]
LOGS_DIR = _PROJECT_ROOT / "logs"

LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-30s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


class _DatedFileHandler(logging.FileHandler):

    def __init__(self, log_dir: Path, stem: str, level: int) -> None:
        self._log_dir = log_dir
        self._stem = stem
        self._current_date = date.today()
        log_dir.mkdir(parents=True, exist_ok=True)
        super().__init__(str(self._path(self._current_date)), encoding="utf-8", delay=True)
        self.setLevel(level)

    def _path(self, d: date) -> Path:
        return self._log_dir / f"{self._stem}.{d}"

    def emit(self, record: logging.LogRecord) -> None:
        today = date.today()
        if today != self._current_date:
            self.close()
            self._current_date = today
            self.baseFilename = str(self._path(today))
        super().emit(record)


def _make_dated_handler(log_dir: Path, stem: str, level: int) -> _DatedFileHandler:
    handler = _DatedFileHandler(log_dir, stem, level)
    handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    return handler


def setup_logging(debug: bool = False) -> None:
    level = logging.DEBUG if debug else logging.INFO

    formatter = logging.Formatter(LOG_FORMAT, DATE_FORMAT)

    console = logging.StreamHandler()
    console.setLevel(level)
    console.setFormatter(formatter)

    app_file = _make_dated_handler(LOGS_DIR / "backend", "app.log", level)

    error_file = _make_dated_handler(LOGS_DIR / "backend", "error.log", logging.ERROR)

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()
    root.addHandler(console)
    root.addHandler(app_file)
    root.addHandler(error_file)

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)

    get_frontend_logger().info("--- frontend logger started ---")

    logging.getLogger(__name__).info(
        "Logging configured | level=%s | logs_dir=%s",
        logging.getLevelName(level),
        LOGS_DIR,
    )


def get_frontend_logger() -> logging.Logger:
    logger = logging.getLogger("app.frontend")
    if not logger.handlers:
        logger.addHandler(_make_dated_handler(LOGS_DIR / "frontend", "app.log", logging.INFO))
        logger.addHandler(_make_dated_handler(LOGS_DIR / "frontend", "error.log", logging.ERROR))
        logger.propagate = False
    return logger
