# DealScout — Marketplace Price Aggregator

## Overview
Mobile app (Expo + React Native) that lets users search products, compare prices from multiple local sellers, and filter by distance from their location.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor async). MongoDB 2dsphere geospatial index on `listings.location` powers radius-based deal search via `$geoNear` aggregation — functionally equivalent to PostGIS `ST_DWithin` / `ST_DistanceSphere`.
- **Frontend**: Expo Router with bottom tab navigation (Home / Browse / Nearby) + product detail stack route.
- **Storage**: MongoDB collections — `products`, `sellers`, `categories`, `listings` — seeded on startup (10 products × 8 sellers = 80 listings around San Francisco).

## Backend Endpoints (all prefixed `/api`)
- `GET /api/` — health check
- `GET /api/categories` — list categories
- `GET /api/products?q=&category=&lat=&lon=` — search products (best_price, seller_count, nearest_distance_km)
- `GET /api/products/{id}?lat=&lon=` — product detail
- `GET /api/products/{id}/deals?lat=&lon=&radius_km=&sort=price_asc|distance_asc|date_desc&limit=` — geo-filtered deals with per-listing `distance_km`

## Frontend Screens
- **Home** (`/`): brand header, search bar, category chips (horizontal scroll), trending deals list
- **Browse** (`/browse`): full search + filter/sort bottom sheet (radius, sort mode)
- **Nearby** (`/nearby`): distance-sorted list with radius chip row
- **Live** (`/live`): real Facebook Marketplace + Carousell listings via Apify, source badges, deep-link to open the listing in-browser
- **Product Detail** (`/product/[id]`): hero image, seller list with prices/distance/stock, sticky glass CTA showing best deal

## Live search + Scheduled Index (Apify integration)
### Curated Index (primary)
- **Scheduler**: APScheduler runs `run_index_cycle` every `INDEX_INTERVAL_HOURS` (default 6h). Each cycle iterates over 10 electronics keywords × 2 sources (Facebook Marketplace, Carousell).
- **Per (keyword, source) cell**: scrape → filter to items posted within `INDEX_RECENT_DAYS` (21 days) → keep top `INDEX_TOP_N` (10) cheapest → upsert into `indexed_listings`.
- **Sold detection**: items previously indexed for that (source, keyword) but missing from a re-scrape are soft-deleted (`is_active=false`, `sold_at=now`).
- **Unique key**: `(source, external_id)` where `external_id = source_id || listing_url`.
- Endpoints:
  - `GET /api/index/status` — scheduler config + counts + last run
  - `GET /api/index/keywords` — list of preset keywords
  - `GET /api/index/listings?keyword=&source=&sort=price_asc|recent&limit=` — query curated index
  - `POST /api/index/refresh` — trigger a cycle now (background)

### Preset keywords (electronics)
`iphone, macbook, samsung, ps5, xbox, laptop, airpods, ipad, headphones, playstation`

### Live on-demand search (secondary)
- `GET /api/live/search?q=<query>&sources=facebook,carousell` — runs Apify actors in parallel, 60-min cache. Used only if the user searches a keyword outside the preset list. Kept as an escape hatch.

### Data sources
- Facebook actor: `apify/facebook-marketplace-scraper` — city configured via `FB_MARKETPLACE_CITY` (default `medan`).
- Carousell actor: `automation-lab/carousell-listings-scraper` — market `CAROUSELL_MARKET` (default `id`).
- OLX actor: `crawlerbros/olx-global-scraper` — wired in `live_search.py` but **not** in `ACTIVE_SOURCES`; OLX Indonesia is currently blocked (returns fallback dummy data). Flip on by adding `"olx"` to `ACTIVE_SOURCES` in `indexer.py` and picking a working country (`pl`, `br`, or `in`).

### Free-scraping option (future)
For zero-cost alternatives to Apify, options are limited — Facebook Marketplace / Carousell / OLX all use anti-bot (Cloudflare + fingerprinting). Practical free-tier paths: (a) direct `httpx` scraping via rotating residential proxies (need proxy account, not truly free), (b) Google Custom Search Engine restricted to marketplace domains (100 free queries/day). Both are strictly less reliable than Apify and would need custom parsers per site. Kept as backlog.

### Env vars
`APIFY_TOKEN`, `APIFY_MAX_ITEMS`, `APIFY_MAX_COST_USD`, `APIFY_CACHE_TTL_MINUTES`, `FB_MARKETPLACE_CITY`, `CAROUSELL_MARKET`, `OLX_COUNTRY`, `INDEX_SCHEDULER_ENABLED`, `INDEX_INTERVAL_HOURS`, `INDEX_TOP_N`, `INDEX_RECENT_DAYS`.


## Design
Sage green (#5C8065) brand, iOS-native clean personality, Ionicons + MaterialCommunityIcons.

## Permissions
- iOS: `NSLocationWhenInUseUsageDescription`
- Android: `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`
- Falls back to San Francisco (37.7749, -122.4194) if denied.

## Next Ideas
- Save/favorite deals, price history charts, seller ratings & reviews, in-app checkout deep-links.
