"""Apify-powered live search for Facebook Marketplace + Carousell.

Runs Actors, normalizes their outputs to a common `LiveListing` shape, and caches
results in MongoDB with a TTL so we don't burn credits on repeat queries.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional
from urllib.parse import quote

from apify_client import ApifyClientAsync
from pydantic import BaseModel

logger = logging.getLogger("marketplace.live")

APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
MAX_ITEMS = int(os.environ.get("APIFY_MAX_ITEMS", "15"))
MAX_COST_USD = float(os.environ.get("APIFY_MAX_COST_USD", "0.25"))
CACHE_TTL_MIN = int(os.environ.get("APIFY_CACHE_TTL_MINUTES", "60"))
FB_CITY = os.environ.get("FB_MARKETPLACE_CITY", "medan")
CAROUSELL_MARKET = os.environ.get("CAROUSELL_MARKET", "id")
OLX_COUNTRY = os.environ.get("OLX_COUNTRY", "id")

ACTORS: dict[str, str] = {
    "facebook": "apify/facebook-marketplace-scraper",
    "carousell": "automation-lab/carousell-listings-scraper",
    "olx": "crawlerbros/olx-global-scraper",
}

Source = Literal["facebook", "carousell", "olx"]


class LiveListing(BaseModel):
    source: Source
    source_id: Optional[str] = None
    title: Optional[str] = None
    price: Optional[float] = None
    price_text: Optional[str] = None
    currency: Optional[str] = None
    image_url: Optional[str] = None
    seller: Optional[str] = None
    location: Optional[str] = None
    listing_url: Optional[str] = None
    posted_at: Optional[str] = None
    scraped_at: datetime


def _first(item: dict[str, Any], *names: str) -> Any:
    for name in names:
        value = item.get(name)
        if value not in (None, "", [], {}):
            return value
    return None


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        cleaned = "".join(c for c in str(value).replace(",", "") if c.isdigit() or c == "." or c == "-")
        return float(cleaned) if cleaned else None
    except (ValueError, TypeError):
        return None


def _pick_image(item: dict[str, Any]) -> Optional[str]:
    # Facebook actor: primary_listing_photo = {"photo_image_url": "..."}
    plp = item.get("primary_listing_photo")
    if isinstance(plp, dict):
        for k in ("photo_image_url", "image_url", "image", "uri", "url"):
            v = plp.get(k)
            if isinstance(v, str) and v.startswith("http"):
                return v
        img = plp.get("image")
        if isinstance(img, dict):
            for k in ("uri", "url"):
                if isinstance(img.get(k), str) and img[k].startswith("http"):
                    return img[k]
    for key in ("imageUrl", "image", "thumbnail", "image_url", "primaryImageUrl", "photo"):
        v = item.get(key)
        if isinstance(v, str) and v.startswith("http"):
            return v
        if isinstance(v, list) and v:
            first = v[0]
            if isinstance(first, str) and first.startswith("http"):
                return first
            if isinstance(first, dict):
                for k in ("url", "uri", "src", "photo_image_url"):
                    if isinstance(first.get(k), str) and first[k].startswith("http"):
                        return first[k]
    photos = item.get("photos") or item.get("images") or item.get("listing_photos")
    if isinstance(photos, list) and photos:
        first = photos[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            for k in ("url", "uri", "src", "photo_image_url"):
                if isinstance(first.get(k), str):
                    return first[k]
    return None


def _to_str(value: Any, *keys: str) -> Optional[str]:
    """Coerce a value that might be a string, dict-with-name, or None to a string."""
    if value is None:
        return None
    if isinstance(value, str):
        return value or None
    if isinstance(value, dict):
        for k in keys or ("name", "displayName", "display_name", "username", "text"):
            v = value.get(k)
            if isinstance(v, str) and v:
                return v
    return None


def _to_location_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value or None
    if isinstance(value, dict):
        # Facebook actor: {"reverse_geocode": {"city": "...", "state": "..."}}
        rg = value.get("reverse_geocode")
        if isinstance(rg, dict):
            parts = [rg.get("city"), rg.get("state")]
            joined = ", ".join(p for p in parts if p)
            if joined:
                return joined
        for k in ("city", "name", "displayName", "display_name", "text", "address"):
            if isinstance(value.get(k), str):
                return value[k]
    return None


def normalize(item: dict[str, Any], source: Source) -> dict[str, Any]:
    scraped_at = datetime.now(timezone.utc)
    source_id = _first(item, "listingId", "listing_id", "id", "productId", "itemId")
    price_raw = _first(item, "priceValue", "price", "price_amount", "amount", "listing_price")
    if isinstance(price_raw, dict):
        price_num = _to_float(price_raw.get("amount") or price_raw.get("value"))
        price_text = (
            price_raw.get("formatted_amount")
            or price_raw.get("formattedAmount")
            or price_raw.get("text")
            or price_raw.get("formatted")
        )
    else:
        price_num = _to_float(price_raw)
        price_text = str(price_raw) if isinstance(price_raw, str) else None
    return {
        "source": source,
        "source_id": str(source_id) if source_id is not None else None,
        "title": _to_str(_first(item, "title", "name", "marketplace_listing_title"), "text"),
        "price": price_num,
        "price_text": price_text,
        "currency": _to_str(_first(item, "currency", "currencyCode", "priceCurrency")),
        "image_url": _pick_image(item),
        "seller": _to_str(
            _first(
                item,
                "sellerName",
                "seller_username",
                "seller",
                "sellerUsername",
                "user",
                "marketplace_listing_seller",
            ),
            "name",
            "username",
            "displayName",
        ),
        "location": _to_location_str(
            _first(
                item,
                "location",
                "locationAddress",
                "location_address",
                "locationText",
                "cityName",
            )
        ),
        "listing_url": _first(item, "listingUrl", "listing_url", "productUrl", "url"),
        "posted_at": _first(item, "postedAt", "posted_at", "created_at", "timePosted", "creationTime"),
        "scraped_at": scraped_at,
    }


def _fb_search_url(query: str) -> str:
    q = quote(query.strip())
    return f"https://www.facebook.com/marketplace/{FB_CITY}/search/?query={q}&exact=false"


def build_actor_input(source: Source, query: str) -> dict[str, Any]:
    if source == "facebook":
        return {
            "startUrls": [{"url": _fb_search_url(query)}],
            "maxItems": MAX_ITEMS,
            "resultsLimit": MAX_ITEMS,
            "maxResults": MAX_ITEMS,
        }
    if source == "carousell":
        return {
            "keywords": [query],
            "market": CAROUSELL_MARKET,
            "maxItems": MAX_ITEMS,
            "includeDetails": True,
            "maxDetailItems": MAX_ITEMS,
            "proxyType": "residential",
        }
    # olx (crawlerbros/olx-global-scraper)
    return {
        "country": OLX_COUNTRY,
        "mode": "searchListings",
        "query": query,
        "maxItems": MAX_ITEMS,
        "maxPages": 1,
        "useProxy": True,
        "autoEscalateOnBlock": True,
        "fetchListingDetails": False,
        "proxyConfiguration": {
            "useApifyProxy": True,
            "apifyProxyGroups": ["RESIDENTIAL"],
        },
    }


async def run_actor(source: Source, query: str) -> list[dict[str, Any]]:
    if not APIFY_TOKEN:
        raise RuntimeError("APIFY_TOKEN is not configured")
    client = ApifyClientAsync(token=APIFY_TOKEN)
    actor_id = ACTORS[source]
    actor_input = build_actor_input(source, query)
    logger.info("Running Apify actor %s for query=%r", actor_id, query)
    try:
        run = await client.actor(actor_id).call(
            run_input=actor_input,
            max_items=MAX_ITEMS,
            max_total_charge_usd=MAX_COST_USD,
            run_timeout=timedelta(seconds=180),
            wait_duration=timedelta(seconds=120),
        )
    except Exception as exc:
        logger.exception("Apify actor call failed: %s", exc)
        raise
    if not run:
        logger.warning("Apify actor %s did not finish within wait window", actor_id)
        return []
    # apify-client v3 returns a Pydantic Run model; normalize to dict
    run_data = run.model_dump() if hasattr(run, "model_dump") else run
    status = run_data.get("status")
    if status != "SUCCEEDED":
        logger.warning("Apify actor %s ended with status %s", actor_id, status)
        return []
    dataset_id = run_data.get("default_dataset_id") or run_data.get("defaultDatasetId")
    if not dataset_id:
        return []
    items: list[dict[str, Any]] = []
    async for item in client.dataset(dataset_id).iterate_items():
        items.append(item)
    logger.info("Apify actor %s returned %d items", actor_id, len(items))
    if items:
        sample_keys = sorted(items[0].keys())
        logger.info("Sample item keys (%s): %s", actor_id, sample_keys)
    return items


async def search_live(db, query: str, sources: list[Source]) -> list[dict[str, Any]]:
    """Cache-first live search. Returns normalized listings across `sources`."""
    query_key = query.strip().lower()
    if not query_key:
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=CACHE_TTL_MIN)
    cache_col = db.live_cache

    stale_sources: list[Source] = []
    cached: list[dict[str, Any]] = []
    for source in sources:
        entry = await cache_col.find_one({"query": query_key, "source": source})
        scraped_at = entry.get("scraped_at") if entry else None
        if isinstance(scraped_at, datetime) and scraped_at.tzinfo is None:
            scraped_at = scraped_at.replace(tzinfo=timezone.utc)
        if entry and scraped_at and scraped_at > cutoff:
            cached.extend(entry.get("listings") or [])
        else:
            stale_sources.append(source)

    if stale_sources:
        results = await asyncio.gather(
            *(run_actor(s, query) for s in stale_sources),
            return_exceptions=True,
        )
        for source, res in zip(stale_sources, results):
            if isinstance(res, Exception):
                logger.error("Source %s failed: %s", source, res)
                fallback = await cache_col.find_one({"query": query_key, "source": source})
                if fallback and fallback.get("listings"):
                    cached.extend(fallback["listings"])
                continue
            normalized = [normalize(item, source) for item in res]
            normalized = [n for n in normalized if n.get("title") or n.get("listing_url")]
            await cache_col.update_one(
                {"query": query_key, "source": source},
                {
                    "$set": {
                        "query": query_key,
                        "source": source,
                        "scraped_at": datetime.now(timezone.utc),
                        "listings": normalized,
                    }
                },
                upsert=True,
            )
            cached.extend(normalized)

    return cached
