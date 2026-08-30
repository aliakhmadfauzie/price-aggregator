import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, Category, Product } from '@/src/api';
import { ProductCard } from '@/src/components/ProductCard';
import { theme } from '@/src/theme';
import { useUserLocation } from '@/src/useUserLocation';

const CATEGORY_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  sneakers: 'shoe-sneaker',
  electronics: 'laptop',
  audio: 'headphones',
  watches: 'watch',
  cameras: 'camera',
  gaming: 'gamepad-variant',
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const loc = useUserLocation();

  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [cats, prods] = await Promise.all([
        api.categories(),
        api.products({
          category: selectedCategory ?? undefined,
          lat: loc?.latitude,
          lon: loc?.longitude,
        }),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (e) {
      setError('Failed to load. Tap to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, loc?.latitude]);

  const trending = useMemo(() => products.slice(0, 8), [products]);

  const onSubmitSearch = () => {
    router.push({ pathname: '/browse', params: { q: query, category: selectedCategory ?? '' } });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="home-screen">
      <View style={styles.header}>
        <Text style={styles.brand}>DealScout</Text>
        <Text style={styles.tagline}>Compare local prices in seconds</Text>

        <Pressable
          testID="home-search-input"
          style={styles.searchBar}
          onPress={onSubmitSearch}
        >
          <Ionicons name="search" size={20} color={theme.color.muted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search sneakers, iPhone, headphones…"
            placeholderTextColor={theme.color.muted}
            returnKeyType="search"
            onSubmitEditing={onSubmitSearch}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} testID="clear-search-btn">
              <Ionicons name="close-circle" size={18} color={theme.color.muted} />
            </Pressable>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={theme.color.brand}
          />
        }
      >
        <View style={styles.chipRowWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRowContent}
          >
            <CategoryChip
              testID="category-chip-all"
              label="All"
              icon="apps"
              active={selectedCategory === null}
              onPress={() => setSelectedCategory(null)}
            />
            {categories.map((c) => (
              <CategoryChip
                key={c.id}
                testID={`category-chip-${c.id}`}
                label={c.name}
                icon={CATEGORY_ICONS[c.id] ?? 'tag'}
                active={selectedCategory === c.id}
                onPress={() => setSelectedCategory(c.id === selectedCategory ? null : c.id)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Trending deals</Text>
            <Pressable
              onPress={() =>
                router.push({ pathname: '/browse', params: { category: selectedCategory ?? '' } })
              }
              testID="home-see-all-btn"
            >
              <Text style={styles.sectionLink}>See all</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={theme.color.brand} />
            </View>
          ) : error ? (
            <Pressable style={styles.errorBox} onPress={load} testID="retry-btn">
              <Text style={styles.errorText}>{error}</Text>
            </Pressable>
          ) : trending.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="magnify" size={40} color={theme.color.muted} />
              <Text style={styles.emptyText}>No products found in this category.</Text>
            </View>
          ) : (
            <FlatList
              data={trending}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={{ gap: theme.spacing.md }}
              renderItem={({ item }) => (
                <ProductCard
                  product={item}
                  onPress={() =>
                    router.push({ pathname: '/product/[id]', params: { id: item.id } })
                  }
                />
              )}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function CategoryChip({
  label,
  icon,
  active,
  onPress,
  testID,
}: {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap | 'apps';
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      {icon === 'apps' ? (
        <Ionicons
          name="apps"
          size={16}
          color={active ? theme.color.onBrandPrimary : theme.color.onSurface}
        />
      ) : (
        <MaterialCommunityIcons
          name={icon}
          size={16}
          color={active ? theme.color.onBrandPrimary : theme.color.onSurface}
        />
      )}
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
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
  brand: {
    fontSize: theme.font.xxxl,
    fontWeight: '700',
    color: theme.color.onSurface,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: theme.font.base,
    color: theme.color.onSurfaceSecondary,
    marginBottom: theme.spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.color.surfaceSecondary,
    paddingHorizontal: theme.spacing.md,
    height: 48,
    borderRadius: theme.radius.md,
  },
  searchInput: { flex: 1, fontSize: theme.font.lg, color: theme.color.onSurface },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipActive: { backgroundColor: theme.color.brandPrimary },
  chipLabel: { fontSize: theme.font.base, fontWeight: '500', color: theme.color.onSurface },
  chipLabelActive: { color: theme.color.onBrandPrimary },
  section: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: { fontSize: theme.font.xl, fontWeight: '700', color: theme.color.onSurface },
  sectionLink: { fontSize: theme.font.base, color: theme.color.brand, fontWeight: '600' },
  loadingBox: { paddingVertical: theme.spacing.xxxl, alignItems: 'center' },
  errorBox: {
    padding: theme.spacing.lg,
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  errorText: { color: theme.color.error },
  emptyBox: { alignItems: 'center', padding: theme.spacing.xxl, gap: theme.spacing.sm },
  emptyText: { color: theme.color.muted },
});
