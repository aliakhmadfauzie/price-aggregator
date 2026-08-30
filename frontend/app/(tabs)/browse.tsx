import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, Product, SortOption } from '@/src/api';
import { ProductCard } from '@/src/components/ProductCard';
import { SORT_LABELS, theme } from '@/src/theme';
import { useUserLocation } from '@/src/useUserLocation';

const RADIUS_OPTIONS = [2, 5, 10, 25, 50, 100];
const SORT_OPTIONS: SortOption[] = ['price_asc', 'distance_asc', 'date_desc'];

export default function BrowseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const loc = useUserLocation();

  const [query, setQuery] = useState(params.q ?? '');
  const [category, setCategory] = useState<string | null>(params.category || null);
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [sort, setSort] = useState<SortOption>('price_asc');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['55%'], []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.products({
        q: query || undefined,
        category: category || undefined,
        lat: loc?.latitude,
        lon: loc?.longitude,
      });
      const filtered = loc
        ? res.filter(
            (p) => p.nearest_distance_km === null || p.nearest_distance_km <= radiusKm,
          )
        : res;
      const sorted = [...filtered].sort((a, b) => {
        if (sort === 'price_asc') return a.best_price - b.best_price;
        if (sort === 'distance_asc') {
          const av = a.nearest_distance_km ?? Infinity;
          const bv = b.nearest_distance_km ?? Infinity;
          return av - bv;
        }
        return 0;
      });
      setProducts(sorted);
    } catch {
      setError('Failed to load. Tap to retry.');
    } finally {
      setLoading(false);
    }
  }, [query, category, sort, radiusKm, loc?.latitude, loc?.longitude]);

  useEffect(() => {
    load();
  }, [load]);

  const activeFilterCount =
    (category ? 1 : 0) + (radiusKm !== 25 ? 1 : 0) + (sort !== 'price_asc' ? 1 : 0);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="browse-screen">
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={theme.color.muted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search products…"
            placeholderTextColor={theme.color.muted}
            returnKeyType="search"
            onSubmitEditing={load}
            testID="search-input"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} testID="clear-search-btn">
              <Ionicons name="close-circle" size={18} color={theme.color.muted} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.filterRow}>
        <Pressable
          style={styles.filterBtn}
          onPress={() => sheetRef.current?.snapToIndex(0)}
          testID="open-filter-sheet-btn"
        >
          <Ionicons name="options-outline" size={18} color={theme.color.onSurface} />
          <Text style={styles.filterBtnText}>Filter & Sort</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.filterMeta}>
          <Ionicons name="location-outline" size={14} color={theme.color.muted} />
          <Text style={styles.filterMetaText}>
            Within {radiusKm} km • {SORT_LABELS[sort]}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      ) : error ? (
        <Pressable style={styles.centerBox} onPress={load} testID="retry-btn">
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : products.length === 0 ? (
        <View style={styles.centerBox} testID="search-empty-state">
          <Ionicons name="search" size={40} color={theme.color.muted} />
          <Text style={styles.emptyTitle}>No products found</Text>
          <Text style={styles.emptySub}>Try widening your radius or clearing filters.</Text>
          <Pressable
            style={styles.emptyCta}
            onPress={() => {
              setCategory(null);
              setQuery('');
              setRadiusKm(100);
            }}
            testID="clear-filters-btn"
          >
            <Text style={styles.emptyCtaText}>Clear filters</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
            paddingBottom: theme.spacing.xxl,
          }}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}

      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={{ backgroundColor: theme.color.borderStrong }}
      >
        <BottomSheetView style={styles.sheetContent} testID="filter-sheet">
          <Text style={styles.sheetTitle}>Filter & Sort</Text>

          <Text style={styles.sheetLabel}>Sort by</Text>
          <View style={styles.optionRow}>
            {SORT_OPTIONS.map((s) => {
              const active = sort === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSort(s)}
                  style={[styles.pill, active && styles.pillActive]}
                  testID={`sort-${s}`}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {SORT_LABELS[s]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Radius</Text>
          <View style={styles.optionRow}>
            {RADIUS_OPTIONS.map((r) => {
              const active = radiusKm === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRadiusKm(r)}
                  style={[styles.pill, active && styles.pillActive]}
                  testID={`radius-${r}`}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{r} km</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.applyBtn, { marginBottom: insets.bottom + theme.spacing.md }]}
            onPress={() => sheetRef.current?.close()}
            testID="apply-filter-btn"
          >
            <Text style={styles.applyBtnText}>Apply</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.color.surfaceSecondary,
    paddingHorizontal: theme.spacing.md,
    height: 44,
    borderRadius: theme.radius.md,
  },
  searchInput: { flex: 1, fontSize: theme.font.lg, color: theme.color.onSurface },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    height: 36,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  filterBtnText: { fontSize: theme.font.base, fontWeight: '600', color: theme.color.onSurface },
  filterBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.color.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  filterBadgeText: { fontSize: 11, color: theme.color.onBrandPrimary, fontWeight: '700' },
  filterMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filterMetaText: { fontSize: theme.font.sm, color: theme.color.muted },
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
  emptyCta: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    height: 40,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCtaText: { color: theme.color.onBrandPrimary, fontWeight: '600' },
  sheetBg: { backgroundColor: theme.color.surface },
  sheetContent: { flex: 1, padding: theme.spacing.lg, gap: theme.spacing.md },
  sheetTitle: { fontSize: theme.font.xl, fontWeight: '700', color: theme.color.onSurface },
  sheetLabel: {
    fontSize: theme.font.sm,
    fontWeight: '600',
    color: theme.color.onSurfaceSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: theme.spacing.sm,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  pill: {
    paddingHorizontal: theme.spacing.md,
    height: 36,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: theme.color.brand },
  pillText: { fontSize: theme.font.base, color: theme.color.onSurface, fontWeight: '500' },
  pillTextActive: { color: theme.color.onBrandPrimary },
  applyBtn: {
    marginTop: 'auto',
    height: 52,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: { color: theme.color.onBrandPrimary, fontSize: theme.font.lg, fontWeight: '700' },
});
