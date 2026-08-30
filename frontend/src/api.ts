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
};
