export const theme = {
  color: {
    surface: '#FFFFFF',
    onSurface: '#111111',
    surfaceSecondary: '#F5F5F5',
    onSurfaceSecondary: '#444444',
    surfaceTertiary: '#EFEFEF',
    onSurfaceTertiary: '#222222',
    surfaceInverse: '#1A1A1A',
    onSurfaceInverse: '#FFFFFF',
    brand: '#5C8065',
    brandPrimary: '#5C8065',
    onBrandPrimary: '#FFFFFF',
    brandSecondary: '#84A38C',
    brandTertiary: '#E8F0E9',
    onBrandTertiary: '#5C8065',
    success: '#4CAF50',
    warning: '#FFC107',
    error: '#E53935',
    border: '#E0E0E0',
    borderStrong: '#BDBDBD',
    divider: '#EEEEEE',
    muted: '#8A8A8A',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48,
  },
  radius: {
    sm: 6,
    md: 12,
    lg: 20,
    pill: 999,
  },
  font: {
    sm: 12,
    base: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
} as const;

export type SortOption = 'price_asc' | 'distance_asc' | 'date_desc';

export const SORT_LABELS: Record<SortOption, string> = {
  price_asc: 'Lowest price',
  distance_asc: 'Closest',
  date_desc: 'Newest',
};
