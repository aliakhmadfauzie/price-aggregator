import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, DealsResponse, Listing, Product, SortOption } from '@/src/api';
import { SORT_LABELS, theme } from '@/src/theme';
import { useUserLocation } from '@/src/useUserLocation';

const SORT_OPTIONS: SortOption[] = ['price_asc', 'distance_asc', 'date_desc'];

const STOCK_LABEL: Record<Listing['stock_status'], { label: string; color: string }> = {
  in_stock: { label: 'In stock', color: theme.color.success },
  low_stock: { label: 'Low stock', color: theme.color.warning },
  out_of_stock: { label: 'Out of stock', color: theme.color.error },
};

export default function ProductDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const loc = useUserLocation();

  const [product, setProduct] = useState<Product | null>(null);
  const [deals, setDeals] = useState<DealsResponse | null>(null);
  const [sort, setSort] = useState<SortOption>('price_asc');
  const [radiusKm, setRadiusKm] = useState<number>(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [p, d] = await Promise.all([
        api.product(id, { lat: loc?.latitude, lon: loc?.longitude }),
        api.deals(id, {
          lat: loc?.latitude,
          lon: loc?.longitude,
          radius_km: loc ? radiusKm : undefined,
          sort,
        }),
      ]);
      setProduct(p);
      setDeals(d);
    } catch {
      setError('Failed to load. Tap to retry.');
    } finally {
      setLoading(false);
    }
  }, [id, loc?.latitude, loc?.longitude, sort, radiusKm]);

  useEffect(() => {
    load();
  }, [load]);

  const bestListing = useMemo<Listing | null>(() => {
    if (!deals || deals.listings.length === 0) return null;
    return [...deals.listings]
      .filter((l) => l.stock_status !== 'out_of_stock')
      .sort((a, b) => a.price - b.price)[0] ?? deals.listings[0];
  }, [deals]);

  if (loading && !product) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator color={theme.color.brand} />
      </View>
    );
  }

  if (error || !product) {
    return (
      <Pressable style={styles.centerBox} onPress={load}>
        <Text style={styles.errorText}>{error ?? 'Product not found.'}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container} testID="product-detail-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          <Image source={{ uri: product.image_url }} style={styles.hero} contentFit="cover" transition={200} />
          <Pressable
            style={[styles.floatingBtn, { top: insets.top + theme.spacing.sm, left: theme.spacing.lg }]}
            onPress={() => router.back()}
            testID="detail-back-btn"
          >
            <Ionicons name="chevron-back" size={22} color={theme.color.onSurface} />
          </Pressable>
        </View>

        <View style={styles.summary}>
          <Text style={styles.brand}>{product.brand.toUpperCase()}</Text>
          <Text style={styles.title}>{product.name}</Text>
          <Text style={styles.description}>{product.description}</Text>

          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceLabel}>Best price</Text>
              <Text style={styles.price}>${product.best_price.toFixed(2)}</Text>
            </View>
            <View style={styles.priceMeta}>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="storefront-outline" size={16} color={theme.color.muted} />
                <Text style={styles.metaText}>{product.seller_count} sellers</Text>
              </View>
              {product.nearest_distance_km !== null && (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={16} color={theme.color.muted} />
                  <Text style={styles.metaText}>
                    {product.nearest_distance_km.toFixed(1)} km away
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Sort + radius chips */}
        <View style={styles.controlsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRowContent}
          >
            {SORT_OPTIONS.map((s) => {
              const active = sort === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSort(s)}
                  style={[styles.chip, active && styles.chipActive]}
                  testID={`detail-sort-${s}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {SORT_LABELS[s]}
                  </Text>
                </Pressable>
              );
            })}
            <View style={styles.divider} />
            {[10, 25, 50, 100].map((r) => {
              const active = radiusKm === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRadiusKm(r)}
                  style={[styles.chip, active && styles.chipActive]}
                  testID={`detail-radius-${r}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{r} km</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.sellersSection}>
          <Text style={styles.sectionTitle}>
            {deals ? `${deals.total} sellers` : 'Sellers'}
          </Text>

          {loading ? (
            <ActivityIndicator color={theme.color.brand} style={{ marginTop: theme.spacing.lg }} />
          ) : !deals || deals.listings.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No sellers within this radius.</Text>
            </View>
          ) : (
            <FlatList
              data={deals.listings}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.rowDivider} />}
              renderItem={({ item, index }) => (
                <SellerRow listing={item} best={index === 0 && sort === 'price_asc'} />
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* Sticky bottom CTA (glass) */}
      <BlurView
        intensity={40}
        tint="light"
        style={[styles.ctaBar, { paddingBottom: insets.bottom + theme.spacing.md }]}
      >
        <View style={styles.ctaContent}>
          <View style={styles.ctaLeft}>
            <Text style={styles.ctaLabel}>Best deal</Text>
            <Text style={styles.ctaPrice}>
              {bestListing ? `$${bestListing.price.toFixed(2)}` : '—'}
            </Text>
            {bestListing && (
              <Text style={styles.ctaSub}>
                at {bestListing.seller_name}
                {bestListing.distance_km !== null ? ` • ${bestListing.distance_km.toFixed(1)} km` : ''}
              </Text>
            )}
          </View>
          <Pressable
            style={[styles.ctaBtn, !bestListing && { opacity: 0.4 }]}
            disabled={!bestListing}
            testID="view-best-deal-btn"
          >
            <Text style={styles.ctaBtnText}>View best deal</Text>
            <Ionicons name="arrow-forward" size={18} color={theme.color.onBrandPrimary} />
          </Pressable>
        </View>
      </BlurView>
    </View>
  );
}

function SellerRow({ listing, best }: { listing: Listing; best: boolean }) {
  const stock = STOCK_LABEL[listing.stock_status];
  return (
    <View style={styles.sellerRow} testID={`seller-row-${listing.seller_id}`}>
      <Image
        source={{ uri: listing.seller_image_url }}
        style={styles.sellerAvatar}
        contentFit="cover"
      />
      <View style={{ flex: 1 }}>
        <View style={styles.sellerHeadRow}>
          <Text style={styles.sellerName} numberOfLines={1}>
            {listing.seller_name}
          </Text>
          {best && (
            <View style={styles.bestPill}>
              <Text style={styles.bestPillText}>Best</Text>
            </View>
          )}
        </View>
        <View style={styles.sellerMetaRow}>
          <View style={styles.sellerMetaItem}>
            <Ionicons name="star" size={12} color={theme.color.warning} />
            <Text style={styles.sellerMetaText}>{listing.seller_rating.toFixed(1)}</Text>
          </View>
          {listing.distance_km !== null && (
            <View style={styles.sellerMetaItem}>
              <Ionicons name="location-outline" size={12} color={theme.color.muted} />
              <Text style={styles.sellerMetaText}>{listing.distance_km.toFixed(1)} km</Text>
            </View>
          )}
          <View style={styles.sellerMetaItem}>
            <View style={[styles.stockDot, { backgroundColor: stock.color }]} />
            <Text style={styles.sellerMetaText}>{stock.label}</Text>
          </View>
          <View style={styles.sellerMetaItem}>
            <Text style={[styles.sellerMetaText, { textTransform: 'capitalize' }]}>
              {listing.condition}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.priceCol}>
        <Text style={styles.rowPrice}>${listing.price.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.surface,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surface,
  },
  errorText: {
    color: theme.color.error,
  },
  heroWrap: {
    position: 'relative',
  },
  hero: {
    width: '100%',
    height: 320,
    backgroundColor: theme.color.surfaceTertiary,
  },
  floatingBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  brand: {
    fontSize: theme.font.sm,
    color: theme.color.muted,
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  title: {
    fontSize: theme.font.xxl,
    fontWeight: '700',
    color: theme.color.onSurface,
    lineHeight: 32,
  },
  description: {
    fontSize: theme.font.base,
    color: theme.color.onSurfaceSecondary,
    lineHeight: 20,
    marginTop: theme.spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.brandTertiary,
  },
  priceLabel: {
    fontSize: theme.font.sm,
    color: theme.color.onBrandTertiary,
    fontWeight: '600',
  },
  price: {
    fontSize: theme.font.xxxl,
    fontWeight: '800',
    color: theme.color.onBrandTertiary,
    marginTop: 2,
  },
  priceMeta: {
    gap: 4,
    alignItems: 'flex-end',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: theme.font.sm,
    color: theme.color.onSurfaceSecondary,
  },
  controlsWrap: {
    height: 56,
    justifyContent: 'center',
  },
  chipRowContent: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: theme.color.brand,
  },
  chipText: {
    fontSize: theme.font.base,
    color: theme.color.onSurface,
    fontWeight: '500',
  },
  chipTextActive: {
    color: theme.color.onBrandPrimary,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: theme.color.border,
    marginHorizontal: theme.spacing.xs,
  },
  sellersSection: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.font.lg,
    fontWeight: '700',
    color: theme.color.onSurface,
    marginBottom: theme.spacing.md,
  },
  emptyBox: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.color.muted,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  rowDivider: {
    height: 1,
    backgroundColor: theme.color.divider,
  },
  sellerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.color.surfaceTertiary,
  },
  sellerHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  sellerName: {
    fontSize: theme.font.lg,
    fontWeight: '600',
    color: theme.color.onSurface,
    flexShrink: 1,
  },
  bestPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.brand,
  },
  bestPillText: {
    color: theme.color.onBrandPrimary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  sellerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: theme.spacing.md,
    rowGap: 2,
    marginTop: 2,
  },
  sellerMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sellerMetaText: {
    fontSize: theme.font.sm,
    color: theme.color.onSurfaceSecondary,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  rowPrice: {
    fontSize: theme.font.xl,
    fontWeight: '700',
    color: theme.color.onSurface,
  },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.divider,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  ctaLeft: {
    flexShrink: 1,
  },
  ctaLabel: {
    fontSize: theme.font.sm,
    color: theme.color.muted,
    fontWeight: '600',
  },
  ctaPrice: {
    fontSize: theme.font.xxl,
    fontWeight: '800',
    color: theme.color.onSurface,
  },
  ctaSub: {
    fontSize: theme.font.sm,
    color: theme.color.onSurfaceSecondary,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    height: 52,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.brand,
  },
  ctaBtnText: {
    color: theme.color.onBrandPrimary,
    fontWeight: '700',
    fontSize: theme.font.lg,
  },
});
