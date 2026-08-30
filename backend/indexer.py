"""Scheduled indexer for marketplace listings.

For each preset keyword × active source: scrape, filter to items posted in the
last 3 weeks, keep the 10 cheapest, and upsert into `indexed_listings`. Items
present in the previous cycle but missing this cycle are soft-deleted
(is_active=False, sold_at=now) — treating them as sold/gone.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from dateutil import parser as dateparser

from live_search import Source, normalize, run_actor

logger = logging.getLogger("marketplace.indexer")

PRESET_KEYWORDS: list[str] = [
    "iphone",
    "macbook",
    "samsung",
    "ps5",
    "xbox",
    "laptop",
    "airpods",
    "ipad",
    "headphones",
    "playstation",
]

ACTIVE_SOURCES: list[Source] = ["facebook", "carousell"]

TOP_N_PER_SOURCE_KEYWORD = int(os.environ.get("INDEX_TOP_N", "10"))
RECENT_DAYS = int(os.environ.get("INDEX_RECENT_DAYS", "21"))
CATEGORY = "electronics"


# ---- date parsing ---------------------------------------------------------

_RELATIVE_RE = re.compile(
    r"(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*(?:ago)?",
    re.IGNORECASE,
)


def parse_posted_at(raw: Any, now: Optional[datetime] = None) -> Optional[datetime]:
    """Best-effort parse of a listing timestamp. Returns tz-aware UTC datetime or None."""
    if raw is None:
        return None
    now = now or datetime.now(timezone.utc)
    # Integer unix timestamp (Facebook often uses seconds)
    if isinstance(raw, (int, float)):
        try:
            # Auto-detect ms vs s
            ts = float(raw)
            if ts > 1e12:
                ts /= 1000.0
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    text = str(raw).strip()
    if not text:
        return None
    # Relative like "5 hours ago"
    match = _RELATIVE_RE.search(text)
    if match:
        n = int(match.group(1))
        unit = match.group(2).lower()
        delta_map = {
            "second": timedelta(seconds=n),
            "minute": timedelta(minutes=n),
            "hour": timedelta(hours=n),
            "day": timedelta(days=n),
            "week": timedelta(weeks=n),
            "month": timedelta(days=30 * n),
            "year": timedelta(days=365 * n),
        }
        return now - delta_map[unit]
    # ISO / RFC parse
    try:
        dt = dateparser.parse(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError, OverflowError):
        return None


def _external_id(listing: dict[str, Any]) -> Optional[str]:
    return listing.get("source_id") or listing.get("listing_url")


# ---- core cycle -----------------------------------------------------------


async def index_one(db, keyword: str, source: Source) -> dict[str, int]:
    """Index one (keyword, source) cell. Returns counts for reporting."""
    started_at = datetime.now(timezone.utc)
    cutoff = started_at - timedelta(days=RECENT_DAYS)

    try:
        raw_items = await run_actor(source, keyword)
    except Exception as exc:
        logger.exception("Actor run failed for %s/%s: %s", source, keyword, exc)
        return {"error": 1, "seen": 0, "inserted": 0, "updated": 0, "sold": 0}

    normalized = [normalize(item, source) for item in raw_items]

    # Enrich with parsed posted_at
    for n in normalized:
        n["posted_at_dt"] = parse_posted_at(n.get("posted_at"), started_at)

    # Recency filter: keep items whose posted_at is unknown OR within window.
    # Unknown dates are given the benefit of the doubt since we already run
    # this cycle every 6h — items older than 3 weeks will drop off naturally
    # once they're missing from a re-scrape.
    filtered = [
        n for n in normalized
        if not n.get("posted_at_dt") or n["posted_at_dt"] >= cutoff
    ]

    # Keep only items we can identify AND price
    filtered = [n for n in filtered if _external_id(n) and n.get("price") is not None]

    # Top-N cheapest
    filtered.sort(key=lambda x: (x.get("price") if x.get("price") is not None else float("inf")))
    top = filtered[:TOP_N_PER_SOURCE_KEYWORD]

    # Upsert each
    seen_ext_ids: list[str] = []
    inserted = 0
    updated = 0
    for item in top:
        ext_id = _external_id(item)
        if not ext_id:
            continue
        seen_ext_ids.append(ext_id)
        doc = {
            "source": source,
            "external_id": ext_id,
            "keyword": keyword,
            "category": CATEGORY,
            "title": item.get("title"),
            "price": item.get("price"),
            "price_text": item.get("price_text"),
            "currency": item.get("currency"),
            "image_url": item.get("image_url"),
            "seller": item.get("seller"),
            "location": item.get("location"),
            "listing_url": item.get("listing_url"),
            "posted_at": item.get("posted_at_dt"),
            "posted_at_raw": item.get("posted_at"),
            "last_seen_at": started_at,
            "is_active": True,
            "sold_at": None,
        }
        result = await db.indexed_listings.update_one(
            {"source": source, "external_id": ext_id},
            {
                "$set": doc,
                "$setOnInsert": {"first_seen_at": started_at},
            },
            upsert=True,
        )
        if result.upserted_id:
            inserted += 1
        elif result.modified_count:
            updated += 1

    # Soft-delete anything previously in this (source, keyword) cell not seen this run
    sold_result = await db.indexed_listings.update_many(
        {
            "source": source,
            "keyword": keyword,
            "is_active": True,
            "external_id": {"$nin": seen_ext_ids},
        },
        {"$set": {"is_active": False, "sold_at": started_at}},
    )

    counts = {
        "seen": len(seen_ext_ids),
        "inserted": inserted,
        "updated": updated,
        "sold": sold_result.modified_count,
        "error": 0,
    }
    logger.info(
        "Indexed %s/%s: seen=%d inserted=%d updated=%d sold=%d",
        source, keyword,
        counts["seen"], counts["inserted"], counts["updated"], counts["sold"],
    )
    return counts


async def run_index_cycle(db) -> dict[str, Any]:
    """Run a full cycle across all (keyword, source) pairs."""
    started_at = datetime.now(timezone.utc)
    logger.info("=== Starting index cycle ===")
    total = {"seen": 0, "inserted": 0, "updated": 0, "sold": 0, "error": 0}
    detail: list[dict[str, Any]] = []
    for keyword in PRESET_KEYWORDS:
        for source in ACTIVE_SOURCES:
            counts = await index_one(db, keyword, source)
            detail.append({"keyword": keyword, "source": source, **counts})
            for k in total:
                total[k] += counts.get(k, 0)

    await db.index_runs.insert_one(
        {
            "started_at": started_at,
            "finished_at": datetime.now(timezone.utc),
            "totals": total,
            "detail": detail,
        }
    )
    logger.info("=== Cycle complete: %s ===", total)
    return {"started_at": started_at, "totals": total, "detail": detail}


async def ensure_indexes(db) -> None:
    await db.indexed_listings.create_index(
        [("source", 1), ("external_id", 1)], unique=True
    )
    await db.indexed_listings.create_index([("keyword", 1), ("source", 1)])
    await db.indexed_listings.create_index([("is_active", 1), ("price", 1)])
    await db.indexed_listings.create_index([("last_seen_at", -1)])
