import { FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, IndexedListing, IndexStatus, LiveSource } from '@/src/api';
import { theme } from '@/src/theme';

type SourceFilter = 'all' | LiveSource;

const SOURCE_LABEL: Record<LiveSource, string> = {
  facebook: 'Marketplace',
  carousell: 'Carousell',
  olx: 'OLX',
};

const SOURCE_COLOR: Record<LiveSource, string> = {
  facebook: '#1877F2',
  carousell: '#FF5B7A',
  olx: '#00CC5F',
};

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const wks = Math.floor(days / 7);
  return `${wks}w ago`;
}

export default function DealsScreen() {
  const insets = useSafeAreaInsets();
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keyword, setKeyword] = useState<string>('iphone');
  const [source, setSource] = useState<SourceFilter>('all');
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [listings, setListings] = useState<IndexedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerNote, setTriggerNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [st, ls] = await Promise.all([
        api.indexStatus(),
        api.indexListings({
          keyword,
          source: source === 'all' ? undefined : source,
          sort: 'price_asc',
          limit: 200,
        }),
      ]);
      setStatus(st);
      setKeywords(st.preset_keywords);
      setListings(ls);
    } catch (e) {
      setError('Failed to load deals. Tap to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [keyword, source]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll every 20s while an initial cycle is running (no listings yet)
  useEffect(() => {
    if (listings.length > 0) return;
    const interval = setInterval(() => {
      load();
    }, 20000);
    return () => clearInterval(interval);
  }, [listings.length, load]);

  const counts = useMemo(() => {
    const fb = listings.filter((l) => l.source === 'facebook').length;
    const car = listings.filter((l) => l.source === 'carousell').length;
    return { all: listings.length, facebook: fb, carousell: car };
  }, [listings]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const onManualRefresh = async () => {
    setTriggering(true);
    setTriggerNote(null);
    try {
      await api.indexRefresh();
      setTriggerNote('Refresh started — new results will appear over the next few minutes.');
    } catch {
      setTriggerNote('Failed to start refresh.');
    } finally {
      setTriggering(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="deals-screen">
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Top deals</Text>
          <Pressable
            style={styles.refreshBtn}
            onPress={onManualRefresh}
            disabled={triggering}
            testID="index-refresh-btn"
          >
            {triggering ? (
              <ActivityIndicator size="small" color={theme.color.brand} />
            ) : (
              <>
                <Ionicons name="refresh" size={14} color={theme.color.brand} />
                <Text style={styles.refreshBtnText}>Refresh</Text>
              </>
            )}
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          {status
            ? `Top ${status.top_n_per_source_keyword} cheapest per source · updated every ${status.interval_hours}h`
            : 'Loading…'}
        </Text>
        {status?.last_run?.started_at && (
          <Text style={styles.subtle}>
            Last refresh {timeAgo(status.last_run.started_at)} · {status.active_listings} live listings
          </Text>
        )}
        {triggerNote && <Text style={styles.hintNote}>{triggerNote}</Text>}
      </View>

      {/* Keyword chips */}
      <View style={styles.chipRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRowContent}
        >
          {keywords.map((k) => {
            const active = keyword === k;
            return (
              <Pressable
                key={k}
                onPress={() => setKeyword(k)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`kw-${k}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{k}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Source filter */}
      <View style={styles.filterRow}>
        <SourcePill
          label={`All · ${counts.all}`}
          active={source === 'all'}
          onPress={() => setSource('all')}
          testID="src-all"
        />
        <SourcePill
          label={`Marketplace · ${counts.facebook}`}
          icon={
            <FontAwesome
              name="facebook"
              size={12}
              color={source === 'facebook' ? theme.color.onBrandPrimary : theme.color.onSurface}
            />
          }
          active={source === 'facebook'}
          onPress={() => setSource('facebook')}
          testID="src-facebook"
        />
        <SourcePill
          label={`Carousell · ${counts.carousell}`}
          icon={
            <MaterialCommunityIcons
              name="shopping-outline"
              size={12}
              color={source === 'carousell' ? theme.color.onBrandPrimary : theme.color.onSurface}
            />
          }
          active={source === 'carousell'}
          onPress={() => setSource('carousell')}
          testID="src-carousell"
        />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      ) : error ? (
        <Pressable style={styles.centerBox} onPress={load} testID="retry-btn">
          <Ionicons name="alert-circle" size={40} color={theme.color.error} />
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : listings.length === 0 ? (
        <View style={styles.centerBox}>
          <MaterialCommunityIcons name="clock-outline" size={40} color={theme.color.muted} />
          <Text style={styles.emptyTitle}>Building the index…</Text>
          <Text style={styles.emptySub}>
            First cycle takes 5–10 minutes to scrape all sources. It re-runs every {status?.interval_hours ?? 6}h.
          </Text>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => `${item.source}-${item.external_id}`}
          contentContainerStyle={{
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
            paddingBottom: theme.spacing.xxl,
          }}
          renderItem={({ item, index }) => <DealCard listing={item} rank={index + 1} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.color.brand}
            />
          }
        />
      )}
    </View>
  );
}

function SourcePill({
  label,
  icon,
  active,
  onPress,
  testID,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterPill, active && styles.filterPillActive]}
      testID={testID}
    >
      {icon}
      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function DealCard({ listing, rank }: { listing: IndexedListing; rank: number }) {
  const priceLabel =
    listing.price_text ??
    (listing.price !== null
      ? `${listing.currency ?? ''} ${listing.price.toLocaleString()}`.trim()
      : 'Price on request');
  const color = SOURCE_COLOR[listing.source];
  const badge = SOURCE_LABEL[listing.source];
  const openListing = () => {
    if (listing.listing_url) Linking.openURL(listing.listing_url);
  };
  return (
    <Pressable
      onPress={openListing}
      style={styles.card}
      testID={`deal-${listing.source}-${listing.external_id}`}
      android_ripple={{ color: theme.color.surfaceTertiary }}
    >
      <View style={styles.rankPill}>
        <Text style={styles.rankText}>#{rank}</Text>
      </View>
      {listing.image_url ? (
        <Image
          source={{ uri: listing.image_url }}
          style={styles.cardImage}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <MaterialCommunityIcons name="image-off" size={28} color={theme.color.muted} />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={[styles.sourceBadge, { backgroundColor: color }]}>
          {listing.source === 'facebook' ? (
            <FontAwesome name="facebook" size={10} color="#fff" />
          ) : (
            <MaterialCommunityIcons name="shopping-outline" size={10} color="#fff" />
          )}
          <Text style={styles.sourceBadgeText}>{badge}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {listing.title ?? 'Untitled listing'}
        </Text>
        <Text style={styles.cardPrice}>{priceLabel}</Text>
        <View style={styles.metaRow}>
          {listing.location ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={12} color={theme.color.muted} />
              <Text style={styles.metaText} numberOfLines={1}>
                {listing.location}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={12} color={theme.color.muted} />
            <Text style={styles.metaText}>seen {timeAgo(listing.last_seen_at)}</Text>
          </View>
        </View>
        <View style={styles.linkRow}>
          <Text style={styles.linkText}>Open listing</Text>
          <Ionicons name="open-outline" size={14} color={theme.color.brand} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm, gap: theme.spacing.xs },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: theme.font.xxxl,
    fontWeight: '700',
    color: theme.color.onSurface,
    letterSpacing: -0.5,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    height: 32,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.brandTertiary,
  },
  refreshBtnText: { color: theme.color.brand, fontSize: theme.font.sm, fontWeight: '600' },
  subtitle: {
    fontSize: theme.font.sm,
    color: theme.color.onSurfaceSecondary,
  },
  subtle: {
    fontSize: theme.font.sm,
    color: theme.color.muted,
  },
  hintNote: {
    fontSize: theme.font.sm,
    color: theme.color.brand,
    fontWeight: '600',
    marginTop: 2,
  },
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
  chipActive: { backgroundColor: theme.color.brand },
  chipText: { fontSize: theme.font.base, color: theme.color.onSurface, fontWeight: '500' },
  chipTextActive: { color: theme.color.onBrandPrimary },
  filterRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    height: 32,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  filterPillActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  filterPillText: { fontSize: theme.font.sm, color: theme.color.onSurface, fontWeight: '600' },
  filterPillTextActive: { color: theme.color.onBrandPrimary },
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
  card: {
    flexDirection: 'row',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.color.divider,
    position: 'relative',
  },
  rankPill: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  rankText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardImage: { width: 120, height: 140, backgroundColor: theme.color.surfaceTertiary },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, padding: theme.spacing.md, gap: 4 },
  sourceBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  sourceBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  cardTitle: {
    fontSize: theme.font.lg,
    fontWeight: '600',
    color: theme.color.onSurface,
    marginTop: 2,
  },
  cardPrice: { fontSize: theme.font.lg, fontWeight: '700', color: theme.color.brand },
  metaRow: { flexDirection: 'column', gap: 2, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: theme.font.sm, color: theme.color.onSurfaceSecondary, flexShrink: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  linkText: { fontSize: theme.font.sm, color: theme.color.brand, fontWeight: '600' },
});
