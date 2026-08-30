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
- **Product Detail** (`/product/[id]`): hero image, seller list with prices/distance/stock, sticky glass CTA showing best deal

## Design
Sage green (#5C8065) brand, iOS-native clean personality, Ionicons + MaterialCommunityIcons.

## Permissions
- iOS: `NSLocationWhenInUseUsageDescription`
- Android: `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`
- Falls back to San Francisco (37.7749, -122.4194) if denied.

## Next Ideas
- Save/favorite deals, price history charts, seller ratings & reviews, in-app checkout deep-links.
