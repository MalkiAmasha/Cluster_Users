import csv
from datetime import date, datetime
from functools import lru_cache
from io import StringIO
from typing import Any, Dict, List, NamedTuple, Set

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .db import close_engine, ensure_safe_table_name, get_default_table_name, get_engine

app = FastAPI(title="Dashboard API", version="0.1.0")

app.add_middleware(
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173",
        "https://cluster-user-frontend.vercel.app",   
        "https://cluster-users-production.up.railway.app", 
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

CATEGORY_DEFINITIONS: List[tuple[str, List[str]]] = [
    ("new_users", ["New Users"]),
    ("inactive", ["Inactive"]),
    ("core_gamers", ["Core Gamer"]),
    ("starters", ["Starters"]),
    ("regulars", ["Regular"]),
    ("casuals", ["Casual"]),
    ("previously_active_last_3m", ["Previously Active (last 3 months)"]),
    ("previously_active_before_3m", ["Previously Active (before 3 months)"]),
]

CATEGORY_ALIASES = [alias for alias, _ in CATEGORY_DEFINITIONS]

SEGMENT_LABEL_TO_ALIAS = {
    labels[0]: alias for alias, labels in CATEGORY_DEFINITIONS
}

COLUMN_CANDIDATES: Dict[str, List[str]] = {
    "Segment": ["Segment", "segment"],
    "Name": ["Name", "name"],
    "Email": ["Email", "email"],
    "Phone": ["Phone", "phone"],
    "User ID": ["User ID", "user_id"],
    "Registered Date": ["Registered Date", "registered_date"],
    "Cash Balance": ["Cash Balance", "cash_balance"],
    "Total Contests Joined": ["Total Contests Joined", "total_contests_joined"],
    "IPL Contests": ["IPL Contests", "ipl_contests"],
    "Highest IPL Score": ["Highest IPL Score", "highest_ipl_score"],
    "New Users": ["New Users", "new_users"],
    "Inactive": ["Inactive", "inactive"],
    "Core Gamer": ["Core Gamer", "core_gamer"],
    "Starters": ["Starters", "starters"],
    "Regular": ["Regular", "regular"],
    "Casual": ["Casual", "casual"],
    "Previously Active (last 3 months)": [
        "Previously Active (last 3 months)",
        "prev_active_last3",
        "previously_active_last_3_months",
    ],
    "Previously Active (before 3 months)": [
        "Previously Active (before 3 months)",
        "prev_active_before3",
        "previously_active_before_3_months",
    ],
}


class TableList(BaseModel):
    tables: List[str]


class TablePreview(BaseModel):
    table: str
    row_count: int
    rows: List[dict[str, Any]]


class SegmentCounts(BaseModel):
    segment: str
    counts: Dict[str, int]


class SegmentStatsResponse(BaseModel):
    categories: List[str]
    segments: List[SegmentCounts]
    totals: Dict[str, int]
    total_users: int


class UserSearchResponse(BaseModel):
    count: int
    results: List[Dict[str, Any]]


class SegmentInsightMetrics(BaseModel):
    user_count: int
    avg_cash_balance: float
    avg_total_contests: float
    avg_ipl_contests: float
    avg_highest_ipl_score: float
    avg_days_since_registration: float
    recent_active_share: float


class SegmentInsightResponse(BaseModel):
    segment: str
    metrics: SegmentInsightMetrics
    recent_activity: List[TimelinePoint]


class SegmentTrendPoint(BaseModel):
    label: str
    start_date: date
    end_date: date
    totals: Dict[str, int]


class SegmentTrendResponse(BaseModel):
    segments: List[str]
    points: List[SegmentTrendPoint]


class TimelinePoint(BaseModel):
    label: str
    start_date: date
    end_date: date
    contests: int


class UserTimelineResponse(BaseModel):
    user_id: int
    name: str | None
    segment: str | None
    points: List[TimelinePoint]


def _resolve_table_name(table_name: str | None) -> str:
    return ensure_safe_table_name(table_name) if table_name else get_default_table_name()


class WeekColumn(NamedTuple):
    raw: str
    label: str
    start_date: date
    end_date: date


def _parse_week_column(column_name: str) -> WeekColumn | None:
    cleaned = column_name.strip().strip("'")
    parts = cleaned.split(" - ")
    if len(parts) != 2:
        return None
    try:
        start_dt = datetime.strptime(parts[0], "%Y-%m-%d").date()
        end_dt = datetime.strptime(parts[1], "%Y-%m-%d").date()
    except ValueError:
        return None
    return WeekColumn(raw=column_name, label=cleaned, start_date=start_dt, end_date=end_dt)


@lru_cache(maxsize=10)
def _get_week_columns(table_name: str) -> List[WeekColumn]:
    query = text(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = :table
          AND column_name REGEXP "^'?\\\d{4}-\\\d{2}-\\\d{2} - \\\d{4}-\\\d{2}-\\\d{2}$"
        ORDER BY ordinal_position
        """
    )
    engine = get_engine()
    with engine.connect() as conn:
        column_names = conn.execute(query, {"table": table_name}).scalars().all()

    week_columns: List[WeekColumn] = []
    for name in column_names:
        parsed = _parse_week_column(name)
        if parsed:
            week_columns.append(parsed)
    week_columns.sort(key=lambda col: col.start_date)
    return week_columns


@lru_cache(maxsize=10)
def _list_table_columns(table_name: str) -> tuple[str, ...]:
    query = text(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = :table
        """
    )
    try:
        engine = get_engine()
        with engine.connect() as conn:
            return tuple(conn.execute(query, {"table": table_name}).scalars().all())
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc


def _get_table_column_set(table_name: str) -> Set[str]:
    return set(_list_table_columns(table_name))


def _resolve_column_name(
    column_key: str,
    columns: Set[str],
    table_name: str,
    *,
    required: bool = True,
) -> str | None:
    candidates = COLUMN_CANDIDATES.get(column_key, [column_key])
    for candidate in candidates:
        if candidate in columns:
            return candidate
    if required:
        raise HTTPException(
            status_code=500,
            detail=f"Column '{column_key}' not found in table '{table_name}'.",
        )
    return None


def _avg_decimal_expr(column_name: str | None, alias: str) -> str:
    if column_name:
        return f"AVG(COALESCE(CAST(`{column_name}` AS DECIMAL(18,4)), 0)) AS {alias}"
    return f"0 AS {alias}"


def _avg_days_since_expr(column_name: str | None, alias: str) -> str:
    if column_name:
        return f"AVG(COALESCE(DATEDIFF(CURDATE(), DATE(`{column_name}`)), 0)) AS {alias}"
    return f"0 AS {alias}"


@app.get("/health")
def health() -> dict[str, str]:
    """Ping the database to ensure the engine is healthy."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:  # pragma: no cover - surfaced via HTTP
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    return {"status": "ok"}


@app.get("/tables", response_model=TableList)
def list_tables() -> TableList:
    """Return the list of tables available in the active MySQL schema."""
    query = text(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        ORDER BY table_name ASC
        """
    )
    try:
        engine = get_engine()
        with engine.connect() as conn:
            tables = [row[0] for row in conn.execute(query).all()]
        return TableList(tables=tables)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc


@app.get("/tables/{table_name}", response_model=TablePreview)
def preview_table(table_name: str, limit: int = Query(25, ge=1, le=100)) -> TablePreview:
    """Return a preview slice of a table to inspect its contents."""
    safe_table = ensure_safe_table_name(table_name)
    query = text(f"SELECT * FROM `{safe_table}` LIMIT :limit")
    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(query, {"limit": limit}).mappings().all()
        return TablePreview(table=safe_table, row_count=len(rows), rows=rows)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc


@app.get("/stats/segments", response_model=SegmentStatsResponse)
def segment_stats(table_name: str | None = None) -> SegmentStatsResponse:
    """Aggregate category counts per segment (cluster) for dashboard visuals."""
    safe_table = _resolve_table_name(table_name)
    table_columns = _get_table_column_set(safe_table)
    segment_col = _resolve_column_name("Segment", table_columns, safe_table)
    query = text(
        f"SELECT `{segment_col}` AS segment, COUNT(*) AS user_count FROM `{safe_table}` "
        f"GROUP BY `{segment_col}` ORDER BY `{segment_col}`"
    )

    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(query).mappings().all()
            total_users = conn.execute(
                text(f"SELECT COUNT(*) AS total FROM `{safe_table}`")
            ).scalar_one()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    segments: List[SegmentCounts] = []
    totals: Dict[str, int] = {alias: 0 for alias in CATEGORY_ALIASES}

    for row in rows:
        alias = SEGMENT_LABEL_TO_ALIAS.get(row["segment"], row["segment"])
        counts = {key: 0 for key in CATEGORY_ALIASES}
        if alias in counts:
            counts[alias] = int(row["user_count"] or 0)
            totals[alias] += counts[alias]
        segments.append(SegmentCounts(segment=row["segment"], counts=counts))

    return SegmentStatsResponse(
        categories=CATEGORY_ALIASES,
        segments=segments,
        totals=totals,
        total_users=int(total_users),
    )


@app.get("/segments/{segment}/insights", response_model=SegmentInsightResponse)
def segment_insights(
    segment: str,
    table_name: str | None = None,
    weeks: int = Query(8, ge=1, le=24, description="How many recent weeks to summarize"),
) -> SegmentInsightResponse:
    safe_table = _resolve_table_name(table_name)
    table_columns = _get_table_column_set(safe_table)
    segment_col = _resolve_column_name("Segment", table_columns, safe_table)
    week_columns = _get_week_columns(safe_table)
    if not week_columns:
        raise HTTPException(status_code=404, detail="No weekly columns configured for this table.")

    recent_weeks = week_columns[-weeks:]
    recent_activity_columns = ", ".join(
        f"COALESCE(SUM(CAST(`{col.raw}` AS UNSIGNED)), 0) AS `{col.raw}`" for col in recent_weeks
    )

    cash_balance_col = _resolve_column_name("Cash Balance", table_columns, safe_table, required=False)
    total_contests_col = _resolve_column_name(
        "Total Contests Joined", table_columns, safe_table, required=False
    )
    ipl_contests_col = _resolve_column_name("IPL Contests", table_columns, safe_table, required=False)
    highest_ipl_col = _resolve_column_name(
        "Highest IPL Score", table_columns, safe_table, required=False
    )
    registered_date_col = _resolve_column_name(
        "Registered Date", table_columns, safe_table, required=False
    )

    metrics_fields = [
        "COUNT(*) AS user_count",
        _avg_decimal_expr(cash_balance_col, "avg_cash_balance"),
        _avg_decimal_expr(total_contests_col, "avg_total_contests"),
        _avg_decimal_expr(ipl_contests_col, "avg_ipl_contests"),
        _avg_decimal_expr(highest_ipl_col, "avg_highest_ipl_score"),
        _avg_days_since_expr(registered_date_col, "avg_days_since_registration"),
    ]

    metrics_query = text(
        f"""
        SELECT
            {', '.join(metrics_fields)}
        FROM `{safe_table}`
        WHERE `{segment_col}` = :segment
        """
    )

    recent_active_cols = recent_weeks[-4:] if len(recent_weeks) >= 4 else recent_weeks
    recent_active_expr = " + ".join(
        f"COALESCE(CAST(`{col.raw}` AS SIGNED), 0)" for col in recent_active_cols
    )
    recent_active_query = (
        text(
            f"SELECT COUNT(*) AS active_users FROM `{safe_table}` WHERE `{segment_col}` = :segment AND ({recent_active_expr}) > 0"
        )
        if recent_active_expr
        else None
    )

    recent_activity_query = (
        text(
            f"SELECT {recent_activity_columns} FROM `{safe_table}` WHERE `{segment_col}` = :segment"
        )
        if recent_activity_columns
        else None
    )

    try:
        engine = get_engine()
        with engine.connect() as conn:
            metrics_row = conn.execute(metrics_query, {"segment": segment}).mappings().first()
            if metrics_row is None or (metrics_row["user_count"] or 0) == 0:
                raise HTTPException(status_code=404, detail="Segment not found or has no users.")

            active_users = 0
            if recent_active_query is not None:
                active_users = int(
                    conn.execute(recent_active_query, {"segment": segment}).scalar_one()
                )

            recent_activity_row = (
                conn.execute(recent_activity_query, {"segment": segment}).mappings().first()
                if recent_activity_query is not None
                else None
            )
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    metrics = SegmentInsightMetrics(
        user_count=int(metrics_row["user_count"] or 0),
        avg_cash_balance=float(metrics_row["avg_cash_balance"] or 0),
        avg_total_contests=float(metrics_row["avg_total_contests"] or 0),
        avg_ipl_contests=float(metrics_row["avg_ipl_contests"] or 0),
        avg_highest_ipl_score=float(metrics_row["avg_highest_ipl_score"] or 0),
        avg_days_since_registration=float(metrics_row["avg_days_since_registration"] or 0),
        recent_active_share=(
            active_users / metrics_row["user_count"] if metrics_row["user_count"] else 0.0
        ),
    )

    recent_activity: List[TimelinePoint] = []
    recent_activity_data = dict(recent_activity_row) if recent_activity_row else {}
    for col in recent_weeks:
        value = recent_activity_data.get(col.raw)
        contests = int(value or 0)
        recent_activity.append(
            TimelinePoint(
                label=col.label,
                start_date=col.start_date,
                end_date=col.end_date,
                contests=contests,
            )
        )

    return SegmentInsightResponse(segment=segment, metrics=metrics, recent_activity=recent_activity)


@app.get("/segments/trends", response_model=SegmentTrendResponse)
def segment_trends(
    segments: List[str] | None = Query(default=None, description="Segments to include. Defaults to all."),
    table_name: str | None = None,
    start: date | None = Query(default=None, description="Only include weeks starting on/after this date"),
    end: date | None = Query(default=None, description="Only include weeks ending on/before this date"),
    weeks: int = Query(default=12, ge=1, le=52, description="Fallback number of recent weeks"),
) -> SegmentTrendResponse:
    safe_table = _resolve_table_name(table_name)
    table_columns = _get_table_column_set(safe_table)
    segment_col = _resolve_column_name("Segment", table_columns, safe_table)
    week_columns = _get_week_columns(safe_table)
    if not week_columns:
        raise HTTPException(status_code=404, detail="No weekly columns configured for this table.")

    filtered_weeks = [
        column
        for column in week_columns
        if (start is None or column.start_date >= start) and (end is None or column.end_date <= end)
    ]

    if not filtered_weeks:
        filtered_weeks = week_columns[-weeks:]
    elif len(filtered_weeks) > weeks:
        filtered_weeks = filtered_weeks[-weeks:]

    sum_parts = ", ".join(
        f"COALESCE(SUM(CAST(`{col.raw}` AS UNSIGNED)), 0) AS `{col.raw}`" for col in filtered_weeks
    )

    where_clause = ""
    params: Dict[str, Any] = {}
    if segments:
        binds = [f":segment_{idx}" for idx in range(len(segments))]
        where_clause = f" WHERE `{segment_col}` IN ({', '.join(binds)})"
        params.update({f"segment_{idx}": value for idx, value in enumerate(segments)})

    query = text(
        f"SELECT `{segment_col}` AS segment, {sum_parts} FROM `{safe_table}`{where_clause} GROUP BY `{segment_col}` ORDER BY `{segment_col}`"
    )

    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(query, params).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    if not rows:
        raise HTTPException(status_code=404, detail="No segments matched the provided filters.")

    response_segments = [row["segment"] for row in rows]
    points: List[SegmentTrendPoint] = []
    for column in filtered_weeks:
        totals: Dict[str, int] = {}
        for row in rows:
            value = row.get(column.raw)
            totals[row["segment"]] = int(value or 0)
        points.append(
            SegmentTrendPoint(
                label=column.label,
                start_date=column.start_date,
                end_date=column.end_date,
                totals=totals,
            )
        )

    return SegmentTrendResponse(segments=response_segments, points=points)


@app.get("/users/search", response_model=UserSearchResponse)
def search_users(
    q: str = Query(..., min_length=1, description="User ID, name, email, or phone fragment"),
    table_name: str | None = None,
    limit: int = Query(5, ge=1, le=50),
) -> UserSearchResponse:
    like = f"%{q}%"
    safe_table = _resolve_table_name(table_name)
    table_columns = _get_table_column_set(safe_table)
    name_col = _resolve_column_name("Name", table_columns, safe_table)
    email_col = _resolve_column_name("Email", table_columns, safe_table)
    phone_col = _resolve_column_name("Phone", table_columns, safe_table)
    user_id_col = _resolve_column_name("User ID", table_columns, safe_table)
    query = text(
        f"SELECT * FROM `{safe_table}` "
        f"WHERE LOWER(`{name_col}`) LIKE LOWER(:like) "
        f"OR LOWER(`{email_col}`) LIKE LOWER(:like) "
        f"OR LOWER(CAST(`{phone_col}` AS CHAR)) LIKE LOWER(:like) "
        f"OR CAST(`{user_id_col}` AS CHAR) LIKE :like "
        f"ORDER BY `{name_col}` ASC LIMIT :limit"
    )

    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(query, {"like": like, "limit": limit}).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    return UserSearchResponse(count=len(rows), results=rows)


@app.get("/users/{user_id}/timeline", response_model=UserTimelineResponse)
def user_timeline(
    user_id: int,
    table_name: str | None = None,
    start: date | None = Query(default=None, description="Filter weeks that start on or after this date"),
    end: date | None = Query(default=None, description="Filter weeks that end on or before this date"),
) -> UserTimelineResponse:
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="Start date must be before or equal to end date.")

    safe_table = _resolve_table_name(table_name)
    table_columns = _get_table_column_set(safe_table)
    user_id_col = _resolve_column_name("User ID", table_columns, safe_table)
    name_col = _resolve_column_name("Name", table_columns, safe_table)
    segment_col = _resolve_column_name("Segment", table_columns, safe_table)
    week_columns = _get_week_columns(safe_table)
    if not week_columns:
        raise HTTPException(status_code=404, detail="No weekly columns available in the selected table.")

    column_clause = ", ".join(f"`{col.raw}`" for col in week_columns)
    query = text(
        f"SELECT `{user_id_col}` AS user_id, `{name_col}` AS name, `{segment_col}` AS segment, {column_clause} FROM `{safe_table}` "
        f"WHERE `{user_id_col}` = :user_id LIMIT 1"
    )

    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(query, {"user_id": user_id}).mappings().first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    if row is None:
        raise HTTPException(status_code=404, detail="User not found.")

    points: List[TimelinePoint] = []
    for column in week_columns:
        if start and column.start_date < start:
            continue
        if end and column.end_date > end:
            continue
        raw_value = row.get(column.raw)
        contests = int(raw_value) if raw_value not in (None, "") else 0
        points.append(
            TimelinePoint(
                label=column.label,
                start_date=column.start_date,
                end_date=column.end_date,
                contests=contests,
            )
        )

    return UserTimelineResponse(
        user_id=int(row["user_id"]),
        name=row.get("name"),
        segment=row.get("segment"),
        points=points,
    )


@app.get("/export/users")
def export_users(
    table_name: str | None = None,
    segments: List[str] | None = Query(default=None, description="Segment filters"),
):
    safe_table = _resolve_table_name(table_name)
    table_columns = _get_table_column_set(safe_table)
    segment_col = _resolve_column_name("Segment", table_columns, safe_table)
    name_col = _resolve_column_name("Name", table_columns, safe_table)
    where_clause = ""
    params: Dict[str, Any] = {}

    if segments:
        binds = [f":segment_{idx}" for idx in range(len(segments))]
        where_clause = f" WHERE `{segment_col}` IN ({', '.join(binds)})"
        params.update({f"segment_{idx}": value for idx, value in enumerate(segments)})

    query = text(
        f"SELECT * FROM `{safe_table}`{where_clause} ORDER BY `{segment_col}`, `{name_col}`"
    )

    try:
        engine = get_engine()
        with engine.connect() as conn:
            result = conn.execute(query, params)
            rows = [dict(row._mapping) for row in result]
            columns = result.keys()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    if not rows:
        raise HTTPException(status_code=404, detail="No users found for the provided filters.")

    def iter_csv():
        buffer = StringIO()
        writer = csv.DictWriter(buffer, fieldnames=columns)
        writer.writeheader()
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)

        for row in rows:
            writer.writerow(row)
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)

    filename = "users.csv" if not segments else f"users_{'_'.join(s.replace(' ', '_') for s in segments)}.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter_csv(), media_type="text/csv", headers=headers)


@app.on_event("shutdown")
def shutdown_event() -> None:
    close_engine()


if __name__ == "__main__":
    import os, uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))

