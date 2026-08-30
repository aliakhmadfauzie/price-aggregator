const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export type Category = { id: string; name: string; icon: string };

export type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  image_url: string;
  best_price: number;
  seller_count: number;
  nearest_distance_km: number | null;
};

export type Listing = {
  id: string;
  product_id: string;
  seller_id: string;
  seller_name: string;
  seller_rating: number;
  seller_image_url: string;
  price: number;
  currency: string;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
  condition: 'new' | 'used' | 'refurbished';
  listed_at: string;
  latitude: number;
  longitude: number;
  distance_km: number | null;
};

export type DealsResponse = {
  product_id: string;
  total: number;
  listings: Listing[];
};

export type SortOption = 'price_asc' | 'distance_asc' | 'date_desc';

export type LiveSource = 'facebook' | 'carousell' | 'olx';

export type LiveListing = {
  source: LiveSource;
  source_id: string | null;
  title: string | null;
  price: number | null;
  price_text: string | null;
  currency: string | null;
  image_url: string | null;
  seller: string | null;
  location: string | null;
  listing_url: string | null;
  posted_at: string | null;
  scraped_at: string;
};

export type LiveSearchResponse = {
  query: string;
  total: number;
  listings: LiveListing[];
};

export type IndexedListing = {
  source: LiveSource;
  external_id: string;
  keyword: string;
  category: string;
  title: string | null;
  price: number | null;
  price_text: string | null;
  currency: string | null;
  image_url: string | null;
  seller: string | null;
  location: string | null;
  listing_url: string | null;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
};

export type IndexStatus = {
  scheduler_enabled: boolean;
  interval_hours: number;
  active_sources: string[];
  preset_keywords: string[];
  top_n_per_source_keyword: number;
  recent_days: number;
  active_listings: number;
  total_listings: number;
  last_run: {
    started_at: string;
    finished_at?: string;
    totals?: Record<string, number>;
  } | null;
};

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${path}`);
  }
  return (await res.json()) as T;
}

export const api = {
  categories: () => request<Category[]>('/categories'),
  products: (params: { q?: string; category?: string; lat?: number; lon?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.category) search.set('category', params.category);
    if (params.lat !== undefined) search.set('lat', String(params.lat));
    if (params.lon !== undefined) search.set('lon', String(params.lon));
    const qs = search.toString();
    return request<Product[]>(`/products${qs ? `?${qs}` : ''}`);
  },
  product: (id: string, params: { lat?: number; lon?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.lat !== undefined) search.set('lat', String(params.lat));
    if (params.lon !== undefined) search.set('lon', String(params.lon));
    const qs = search.toString();
    return request<Product>(`/products/${id}${qs ? `?${qs}` : ''}`);
  },
  deals: (
    id: string,
    params: { lat?: number; lon?: number; radius_km?: number; sort?: SortOption } = {},
  ) => {
    const search = new URLSearchParams();
    if (params.lat !== undefined) search.set('lat', String(params.lat));
    if (params.lon !== undefined) search.set('lon', String(params.lon));
    if (params.radius_km !== undefined) search.set('radius_km', String(params.radius_km));
    if (params.sort) search.set('sort', params.sort);
    const qs = search.toString();
    return request<DealsResponse>(`/products/${id}/deals${qs ? `?${qs}` : ''}`);
  },
  liveSearch: (q: string, sources: LiveSource[]) => {
    const search = new URLSearchParams();
    search.set('q', q);
    search.set('sources', sources.join(','));
    return request<LiveSearchResponse>(`/live/search?${search.toString()}`);
  },
  indexKeywords: () => request<string[]>('/index/keywords'),
  indexStatus: () => request<IndexStatus>('/index/status'),
  indexListings: (params: {
    keyword?: string;
    source?: LiveSource;
    include_sold?: boolean;
    sort?: 'price_asc' | 'recent';
    limit?: number;
  } = {}) => {
    const s = new URLSearchParams();
    if (params.keyword) s.set('keyword', params.keyword);
    if (params.source) s.set('source', params.source);
    if (params.include_sold) s.set('include_sold', 'true');
    if (params.sort) s.set('sort', params.sort);
    if (params.limit) s.set('limit', String(params.limit));
    const qs = s.toString();
    return request<IndexedListing[]>(`/index/listings${qs ? `?${qs}` : ''}`);
  },
  indexRefresh: async () => {
    const res = await fetch(`${BASE_URL}/api/index/refresh`, { method: 'POST' });
    if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
    return (await res.json()) as { status: string; at: string };
  },
};
