import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
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

import { api, Product } from '@/src/api';
import { theme } from '@/src/theme';
import { useUserLocation } from '@/src/useUserLocation';

const RADIUS_OPTIONS = [2, 5, 10, 25, 50, 100];

export default function NearbyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const loc = useUserLocation();

  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.products({ lat: loc?.latitude, lon: loc?.longitude });
      setProducts(res);
    } catch {
      setError('Failed to load. Tap to retry.');
    } finally {
      setLoading(false);
    }
  }, [loc?.latitude, loc?.longitude]);

  useEffect(() => {
    load();
  }, [load]);

  const withinRadius = useMemo(() => {
    const filtered = products.filter(
      (p) => p.nearest_distance_km !== null && p.nearest_distance_km <= radiusKm,
    );
    return filtered.sort(
      (a, b) => (a.nearest_distance_km ?? Infinity) - (b.nearest_distance_km ?? Infinity),
    );
  }, [products, radiusKm]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="nearby-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Nearby</Text>
        <View style={styles.locRow}>
          <Ionicons name="location" size={14} color={theme.color.brand} />
          <Text style={styles.locText}>
            {loc?.granted
              ? `Your location • within ${radiusKm} km`
              : `Default: San Francisco • within ${radiusKm} km`}
          </Text>
        </View>
      </View>

      <View style={styles.chipRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRowContent}
        >
          {RADIUS_OPTIONS.map((r) => {
            const active = radiusKm === r;
            return (
              <Pressable
                key={r}
                onPress={() => setRadiusKm(r)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`nearby-radius-${r}`}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {r} km
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      ) : error ? (
        <Pressable style={styles.centerBox} onPress={load} testID="retry-btn">
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : withinRadius.length === 0 ? (
        <View style={styles.centerBox}>
          <MaterialCommunityIcons name="map-marker-off" size={40} color={theme.color.muted} />
          <Text style={styles.emptyTitle}>Nothing within {radiusKm} km</Text>
          <Text style={styles.emptySub}>Try expanding your search radius.</Text>
        </View>
      ) : (
        <FlatList
          data={withinRadius}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.xxl,
            gap: theme.spacing.md,
          }}
          renderItem={({ item }) => (
            <NearbyRow
              product={item}
              onPress={() =>
                router.push({ pathname: '/product/[id]', params: { id: item.id } })
              }
            />
          )}
        />
      )}
    </View>
  );
}

function NearbyRow({ product, onPress }: { product: Product; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      testID={`nearby-row-${product.id}`}
      android_ripple={{ color: theme.color.surfaceTertiary }}
    >
      <Image source={{ uri: product.image_url }} style={styles.rowImage} contentFit="cover" />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowBrand}>{product.brand.toUpperCase()}</Text>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={styles.rowMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={13} color={theme.color.brand} />
            <Text style={[styles.metaText, { color: theme.color.brand, fontWeight: '600' }]}>
              {product.nearest_distance_km?.toFixed(1)} km
            </Text>
          </View>
          <View style={styles.metaItem}>
            <MaterialCommunityIcons
              name="storefront-outline"
              size={13}
              color={theme.color.muted}
            />
            <Text style={styles.metaText}>{product.seller_count}</Text>
          </View>
        </View>
      </View>
      <View style={styles.priceCol}>
        <Text style={styles.priceLabel}>from</Text>
        <Text style={styles.price}>${product.best_price.toFixed(0)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.font.xxxl,
    fontWeight: '700',
    color: theme.color.onSurface,
    letterSpacing: -0.5,
  },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  locText: { fontSize: theme.font.base, color: theme.color.onSurfaceSecondary },
  chipRowWrap: { height: 56, justifyContent: 'center' },
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
  chipActive: { backgroundColor: theme.color.brandPrimary },
  chipLabel: { fontSize: theme.font.base, fontWeight: '500', color: theme.color.onSurface },
  chipLabelActive: { color: theme.color.onBrandPrimary },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  errorText: { color: theme.color.error },
  emptyTitle: { fontSize: theme.font.lg, fontWeight: '600', color: theme.color.onSurface },
  emptySub: { color: theme.color.muted, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.divider,
    backgroundColor: theme.color.surface,
  },
  rowImage: { width: 64, height: 64, borderRadius: theme.radius.md, backgroundColor: theme.color.surfaceTertiary },
  rowBrand: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.color.muted,
    letterSpacing: 0.6,
  },
  rowTitle: {
    fontSize: theme.font.base,
    fontWeight: '600',
    color: theme.color.onSurface,
    marginTop: 2,
  },
  rowMeta: { flexDirection: 'row', gap: theme.spacing.md, marginTop: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: theme.font.sm, color: theme.color.onSurfaceSecondary },
  priceCol: { alignItems: 'flex-end' },
  priceLabel: { fontSize: 11, color: theme.color.muted },
  price: { fontSize: theme.font.xl, fontWeight: '700', color: theme.color.onSurface },
});
