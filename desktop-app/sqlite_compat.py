import uuid

import sqlalchemy
from sqlalchemy import JSON
from sqlalchemy.types import CHAR, TypeDecorator


class SqliteUUID(TypeDecorator):
    impl = CHAR(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value if isinstance(value, uuid.UUID) else uuid.UUID(value)


class SqliteUUIDList(TypeDecorator):
    impl = JSON
    cache_ok = True

    def __init__(self, *args, **kwargs):
        super().__init__()

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return [str(v) for v in value]

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        result = []
        for v in value:
            if isinstance(v, str):
                try:
                    v = uuid.UUID(v)
                except ValueError:
                    pass
            result.append(v)
        return result


def apply() -> None:
    """Make the unmodified backend models (written for Postgres) work on SQLite.

    Patches sqlalchemy.dialects.postgresql.UUID/JSONB and sqlalchemy.ARRAY in
    place, before the backend package is imported, so `from
    sqlalchemy.dialects.postgresql import UUID, JSONB` inside app/models/*.py
    picks up SQLite-compatible replacements without any change to backend/.
    """
    import sqlalchemy.dialects.postgresql as pg

    pg.UUID = lambda *a, **kw: SqliteUUID()
    pg.JSONB = JSON
    sqlalchemy.ARRAY = SqliteUUIDList
