"""Marketplace Price Aggregator API.

Uses MongoDB geospatial queries (2dsphere index + $geoNear) to power
radius-based deal search. This is the MongoDB equivalent of the
PostGIS ST_DWithin / ST_DistanceSphere workflow requested by the user.
"""

from __future__ import annotations

import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from typing import Any, List, Literal, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("marketplace")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


SortOption = Literal["price_asc", "distance_asc", "date_desc"]


class Product(BaseModel):
    id: str
    name: str
    brand: str
    category: str
    description: str
    image_url: str
    best_price: float
    seller_count: int
    nearest_distance_km: Optional[float] = None


class Seller(BaseModel):
    id: str
    name: str
    rating: float
    image_url: str


class Listing(BaseModel):
    id: str
    product_id: str
    seller_id: str
    seller_name: str
    seller_rating: float
    seller_image_url: str
    price: float
    currency: str = "USD"
    stock_status: Literal["in_stock", "low_stock", "out_of_stock"]
    condition: Literal["new", "used", "refurbished"]
    listed_at: datetime
    latitude: float
    longitude: float
    distance_km: Optional[float] = None


class Category(BaseModel):
    id: str
    name: str
    icon: str


class DealsResponse(BaseModel):
    product_id: str
    total: int
    listings: List[Listing]


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------


DEFAULT_LAT = 37.7749  # San Francisco reference for seeded coordinates
DEFAULT_LON = -122.4194


CATEGORIES: List[dict] = [
    {"id": "sneakers", "name": "Sneakers", "icon": "shoe-sneaker"},
    {"id": "electronics", "name": "Electronics", "icon": "laptop"},
    {"id": "audio", "name": "Audio", "icon": "headphones"},
    {"id": "watches", "name": "Watches", "icon": "watch"},
    {"id": "cameras", "name": "Cameras", "icon": "camera"},
    {"id": "gaming", "name": "Gaming", "icon": "gamepad-variant"},
]


PRODUCTS: List[dict] = [
    {
        "id": "prod_nike_af1",
        "name": "Nike Air Force 1 '07",
        "brand": "Nike",
        "category": "sneakers",
        "description": "The classic all-white Air Force 1 '07 in premium leather. Timeless silhouette, all-day comfort.",
        "image_url": "https://images.unsplash.com/photo-1512374382149-233c42b6a83b?crop=entropy&cs=srgb&fm=jpg&w=1080&q=80",
    },
    {
        "id": "prod_adidas_samba",
        "name": "adidas Samba OG",
        "brand": "adidas",
        "category": "sneakers",
        "description": "Iconic terrace silhouette with gum sole and T-toe overlay. Legendary style.",
        "image_url": "https://images.unsplash.com/photo-1588110679566-158c6dea107c?crop=entropy&cs=srgb&fm=jpg&w=1080&q=80",
    },
    {
        "id": "prod_nb_990",
        "name": "New Balance 990v6",
        "brand": "New Balance",
        "category": "sneakers",
        "description": "Made in USA runners with ENCAP midsole cushioning and premium pigskin suede.",
        "image_url": "https://images.unsplash.com/photo-1621315271772-28b1f3a5df87?crop=entropy&cs=srgb&fm=jpg&w=1080&q=80",
    },
    {
        "id": "prod_iphone_15",
        "name": "iPhone 15 Pro 256GB",
        "brand": "Apple",
        "category": "electronics",
        "description": "Titanium design, A17 Pro chip, and the most advanced iPhone camera system yet.",
        "image_url": "https://images.unsplash.com/photo-1592286927505-1def25115558?crop=entropy&cs=srgb&fm=jpg&w=1080&q=80",
    },
    {
        "id": "prod_macbook_air",
        "name": "MacBook Air 13\" M3",
        "brand": "Apple",
        "category": "electronics",
        "description": "Strikingly thin design with M3 chip. Up to 18 hours battery, silent fanless operation.",
        "image_url": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?crop=entropy&cs=srgb&fm=jpg&w=1080&q=80",
    },
    {
        "id": "prod_sony_wh1000",
        "name": "Sony WH-1000XM5",
        "brand": "Sony",
        "category": "audio",
        "description": "Industry-leading noise cancelling headphones with 30-hour battery life.",
        "image_url": "https://images.unsplash.com/photo-1583394838336-acd977736f90?crop=entropy&cs=srgb&fm=jpg&w=1080&q=80",
    },
    {
        "id": "prod_airpods_pro",
        "name": "AirPods Pro (2nd Gen)",
        "brand": "Apple",
        "category": "audio",
        "description": "Active Noise Cancellation, Adaptive Audio, and MagSafe charging case.",
        "image_url": "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?crop=entropy&cs=srgb&fm=jpg&w=1080&q=80",
    },
    {
        "id": "prod_apple_watch",
        "name": "Apple Watch Series 9",
        "brand": "Apple",
        "category": "watches",
        "description": "Brighter display, faster S9 chip, and new double-tap gesture.",
        "image_url": "https://images.unsplash.com/photo-1546868871-7041f2a55e12?crop=entropy&cs=srgb&fm=jpg&w=1080&q=80",
    },
    {
        "id": "prod_sony_a7iv",
        "name": "Sony Alpha a7 IV",
        "brand": "Sony",
        "category": "cameras",
        "description": "33MP full-frame mirrorless with 4K 60p video and improved autofocus.",
        "image_url": "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?crop=entropy&cs=srgb&fm=jpg&w=1080&q=80",
    },
    {
        "id": "prod_ps5",
        "name": "PlayStation 5 Slim",
        "brand": "Sony",
        "category": "gaming",
        "description": "Slimmer design, same lightning-fast SSD, 4K gaming with ray tracing.",
        "image_url": "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?crop=entropy&cs=srgb&fm=jpg&w=1080&q=80",
    },
]


SELLERS: List[dict] = [
    {
        "id": "seller_urban_kicks",
        "name": "Urban Kicks",
        "rating": 4.7,
        "image_url": "https://images.unsplash.com/photo-1602254992120-5b3c3dad1d9d?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
    },
    {
        "id": "seller_downtown_tech",
        "name": "Downtown Tech",
        "rating": 4.5,
        "image_url": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
    },
    {
        "id": "seller_bayside_electronics",
        "name": "Bayside Electronics",
        "rating": 4.8,
        "image_url": "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
    },
    {
        "id": "seller_mission_sneakers",
        "name": "Mission Sneakers",
        "rating": 4.6,
        "image_url": "https://images.unsplash.com/photo-1481437156560-3205f6a55735?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
    },
    {
        "id": "seller_soma_audio",
        "name": "SOMA Audio Lab",
        "rating": 4.9,
        "image_url": "https://images.unsplash.com/photo-1567696911980-2eed69a46042?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
    },
    {
        "id": "seller_north_beach_gadgets",
        "name": "North Beach Gadgets",
        "rating": 4.3,
        "image_url": "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
    },
    {
        "id": "seller_haight_vintage",
        "name": "Haight Vintage Co.",
        "rating": 4.4,
        "image_url": "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
    },
    {
        "id": "seller_pacific_pixel",
        "name": "Pacific Pixel",
        "rating": 4.6,
        "image_url": "https://images.unsplash.com/photo-1560343090-f0409e92791a?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
    },
]


# offsets in km around the reference lat/lon so listings scatter around SF
LISTING_OFFSETS = [
    (0.5, 0.3),
    (1.2, -0.8),
    (-0.6, 1.4),
    (2.5, 2.1),
    (-1.8, -1.2),
    (3.4, -0.5),
    (-2.7, 0.9),
    (0.1, -3.1),
    (4.2, 1.7),
    (-3.5, -2.4),
]


def _offset_coords(lat: float, lon: float, north_km: float, east_km: float) -> tuple[float, float]:
    dlat = north_km / 110.574
    dlon = east_km / (111.320 * cos(radians(lat)))
    return lat + dlat, lon + dlon


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


async def seed_database() -> None:
    """Idempotent seeder for products, sellers, and listings."""
    if await db.products.count_documents({}) == 0:
        await db.products.insert_many([{**p} for p in PRODUCTS])
        logger.info("Seeded %d products", len(PRODUCTS))

    if await db.sellers.count_documents({}) == 0:
        await db.sellers.insert_many([{**s} for s in SELLERS])
        logger.info("Seeded %d sellers", len(SELLERS))

    if await db.categories.count_documents({}) == 0:
        await db.categories.insert_many([{**c} for c in CATEGORIES])
        logger.info("Seeded %d categories", len(CATEGORIES))

    if await db.listings.count_documents({}) == 0:
        listings: List[dict] = []
        now = datetime.now(timezone.utc)
        base_prices = {
            "sneakers": 120.0,
            "electronics": 950.0,
            "audio": 280.0,
            "watches": 399.0,
            "cameras": 2200.0,
            "gaming": 499.0,
        }
        for p in PRODUCTS:
            base = base_prices.get(p["category"], 200.0)
            for i, seller in enumerate(SELLERS):
                # Every seller carries every product — realistic aggregator feel.
                north_km, east_km = LISTING_OFFSETS[i % len(LISTING_OFFSETS)]
                lat, lon = _offset_coords(DEFAULT_LAT, DEFAULT_LON, north_km, east_km)
                # Price varies +/- 25% around base
                price = round(base * (0.78 + 0.05 * i + (hash(p["id"] + seller["id"]) % 10) / 40), 2)
                stock_pool = ["in_stock", "in_stock", "low_stock", "in_stock", "out_of_stock"]
                condition_pool = ["new", "new", "new", "used", "refurbished"]
                listings.append(
                    {
                        "id": f"list_{uuid.uuid4().hex[:12]}",
                        "product_id": p["id"],
                        "seller_id": seller["id"],
                        "seller_name": seller["name"],
                        "seller_rating": seller["rating"],
                        "seller_image_url": seller["image_url"],
                        "price": price,
                        "currency": "USD",
                        "stock_status": stock_pool[(i + hash(p["id"])) % len(stock_pool)],
                        "condition": condition_pool[(i + hash(seller["id"])) % len(condition_pool)],
                        "listed_at": now,
                        "latitude": lat,
                        "longitude": lon,
                        "location": {"type": "Point", "coordinates": [lon, lat]},
                    }
                )
        await db.listings.insert_many(listings)
        logger.info("Seeded %d listings", len(listings))

    # Ensure 2dsphere index for geospatial queries (idempotent)
    await db.listings.create_index([("location", "2dsphere")])


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_database()
    yield
    client.close()


app = FastAPI(title="Marketplace Price Aggregator", lifespan=lifespan)
api_router = APIRouter(prefix="/api")


# ---------- Helpers -----------------------------------------------------


def _strip_mongo(doc: dict) -> dict:
    doc.pop("_id", None)
    doc.pop("location", None)
    return doc


async def _product_projection(product: dict, user_lat: Optional[float], user_lon: Optional[float]) -> Product:
    listings_cursor = db.listings.find(
        {"product_id": product["id"]}, {"_id": 0, "price": 1, "latitude": 1, "longitude": 1}
    )
    listings = await listings_cursor.to_list(length=200)
    if not listings:
        return Product(
            id=product["id"],
            name=product["name"],
            brand=product["brand"],
            category=product["category"],
            description=product["description"],
            image_url=product["image_url"],
            best_price=0.0,
            seller_count=0,
        )
    best_price = min(l["price"] for l in listings)
    nearest = None
    if user_lat is not None and user_lon is not None:
        nearest = min(
            _haversine_km(user_lat, user_lon, l["latitude"], l["longitude"]) for l in listings
        )
    return Product(
        id=product["id"],
        name=product["name"],
        brand=product["brand"],
        category=product["category"],
        description=product["description"],
        image_url=product["image_url"],
        best_price=best_price,
        seller_count=len(listings),
        nearest_distance_km=round(nearest, 2) if nearest is not None else None,
    )


# ---------- Routes ------------------------------------------------------


@api_router.get("/")
async def root() -> dict[str, str]:
    return {"service": "marketplace-price-aggregator", "status": "ok"}


@api_router.get("/categories", response_model=List[Category])
async def list_categories() -> List[Category]:
    docs = await db.categories.find({}, {"_id": 0}).to_list(length=100)
    return [Category(**c) for c in docs]


@api_router.get("/products", response_model=List[Product])
async def list_products(
    q: Optional[str] = Query(None, description="Free text search on name/brand"),
    category: Optional[str] = Query(None),
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=180),
) -> List[Product]:
    filters: dict[str, Any] = {}
    if category:
        filters["category"] = category
    if q:
        filters["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"brand": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.products.find(filters, {"_id": 0}).to_list(length=200)
    return [await _product_projection(d, lat, lon) for d in docs]


@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(
    product_id: str,
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=180),
) -> Product:
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return await _product_projection(doc, lat, lon)


@api_router.get("/products/{product_id}/deals", response_model=DealsResponse)
async def get_product_deals(
    product_id: str,
    lat: Optional[float] = Query(None, ge=-90, le=90, description="User latitude"),
    lon: Optional[float] = Query(None, ge=-180, le=180, description="User longitude"),
    radius_km: Optional[float] = Query(None, gt=0, le=500, description="Search radius in kilometers"),
    sort: SortOption = Query("price_asc"),
    limit: int = Query(50, ge=1, le=200),
) -> DealsResponse:
    """Radius-filtered deal search (MongoDB 2dsphere equivalent of PostGIS ST_DWithin)."""

    product = await db.products.find_one({"id": product_id}, {"_id": 0, "id": 1})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    has_location = lat is not None and lon is not None

    if has_location:
        # $geoNear aggregation → returns distance in meters and supports radius filter.
        pipeline: list[dict] = [
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": [lon, lat]},
                    "distanceField": "distance_meters",
                    "spherical": True,
                    "query": {"product_id": product_id},
                    **({"maxDistance": radius_km * 1000} if radius_km else {}),
                }
            },
            {"$project": {"_id": 0, "location": 0}},
            {"$limit": limit},
        ]
        docs = await db.listings.aggregate(pipeline).to_list(length=limit)
        for d in docs:
            d["distance_km"] = round(d.pop("distance_meters") / 1000, 2)
    else:
        docs = await db.listings.find(
            {"product_id": product_id}, {"_id": 0, "location": 0}
        ).to_list(length=limit)
        for d in docs:
            d["distance_km"] = None

    # Sorting
    if sort == "price_asc":
        docs.sort(key=lambda d: d["price"])
    elif sort == "distance_asc":
        docs.sort(key=lambda d: (d.get("distance_km") is None, d.get("distance_km") or 0))
    elif sort == "date_desc":
        docs.sort(key=lambda d: d["listed_at"], reverse=True)

    listings = [Listing(**d) for d in docs]
    return DealsResponse(product_id=product_id, total=len(listings), listings=listings)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
