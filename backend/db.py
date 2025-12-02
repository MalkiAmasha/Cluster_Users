import os
import re
from typing import Optional
from urllib.parse import quote_plus

from dotenv import load_dotenv
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

load_dotenv(Path(__file__).with_name(".env"))

_engine: Optional[Engine] = None
_TABLE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_ ()-]+$")


def _build_mysql_url() -> str:
    user = os.getenv("MYSQL_USER")
    password = os.getenv("MYSQL_PASSWORD")
    host = os.getenv("MYSQL_HOST")
    database = os.getenv("MYSQL_DATABASE")
    port = os.getenv("MYSQL_PORT", "3306")
    options = os.getenv("MYSQL_OPTIONS")

    if not all([user, password, host, database]):
        raise RuntimeError(
            "MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE must be set in the environment."
        )

    auth = f"{quote_plus(user)}:{quote_plus(password)}"
    url = f"mysql+pymysql://{auth}@{host}:{port}/{database}"
    if options:
        url = f"{url}?{options.lstrip('?')}"
    return url


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = _build_mysql_url()
        pool_size = int(os.getenv("MYSQL_POOL_SIZE", "5"))
        max_overflow = int(os.getenv("MYSQL_POOL_MAX_OVERFLOW", "5"))
        _engine = create_engine(
            url,
            pool_pre_ping=True,
            pool_size=pool_size,
            max_overflow=max_overflow,
        )
    return _engine


def close_engine() -> None:
    global _engine
    if _engine is not None:
        _engine.dispose()
        _engine = None


def ensure_safe_table_name(table_name: str) -> str:
    if not table_name:
        raise ValueError("Table name cannot be empty.")
    candidate = table_name.strip()
    if not candidate:
        raise ValueError("Table name cannot be empty.")
    if not _TABLE_NAME_PATTERN.match(candidate):
        raise ValueError(
            "Table name may only contain letters, numbers, spaces, underscores, parentheses, or hyphens."
        )
    return candidate


def get_default_table_name() -> str:
    return ensure_safe_table_name(os.getenv("MYSQL_TABLE", "user_cluster"))
