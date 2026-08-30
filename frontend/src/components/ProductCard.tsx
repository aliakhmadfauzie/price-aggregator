import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Product } from '@/src/api';
import { theme } from '@/src/theme';

export function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  return (
    <Pressable
      testID={`product-card-${product.id}`}
      style={styles.card}
      onPress={onPress}
      android_ripple={{ color: theme.color.surfaceTertiary }}
    >
      <Image
        source={{ uri: product.image_url }}
        style={styles.cardImage}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.cardBody}>
        <Text style={styles.cardBrand} numberOfLines={1}>
          {product.brand}
        </Text>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {product.name}
        </Text>

        <View style={styles.cardMetaRow}>
          <View>
            <Text style={styles.cardPriceLabel}>from</Text>
            <Text style={styles.cardPrice}>${product.best_price.toFixed(0)}</Text>
          </View>
          <View style={styles.cardMetaRight}>
            <View style={styles.cardMetaItem}>
              <MaterialCommunityIcons
                name="storefront-outline"
                size={14}
                color={theme.color.muted}
              />
              <Text style={styles.cardMetaText}>{product.seller_count} sellers</Text>
            </View>
            {product.nearest_distance_km !== null && (
              <View style={styles.cardMetaItem}>
                <Ionicons name="location-outline" size={14} color={theme.color.muted} />
                <Text style={styles.cardMetaText}>
                  {product.nearest_distance_km.toFixed(1)} km
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.color.divider,
  },
  cardImage: {
    width: 120,
    height: 120,
    backgroundColor: theme.color.surfaceTertiary,
  },
  cardBody: {
    flex: 1,
    padding: theme.spacing.md,
    justifyContent: 'space-between',
  },
  cardBrand: {
    fontSize: theme.font.sm,
    color: theme.color.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardTitle: {
    fontSize: theme.font.lg,
    fontWeight: '600',
    color: theme.color.onSurface,
    marginTop: 2,
  },
  cardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: theme.spacing.sm,
  },
  cardPriceLabel: {
    fontSize: theme.font.sm,
    color: theme.color.muted,
  },
  cardPrice: {
    fontSize: theme.font.xl,
    fontWeight: '700',
    color: theme.color.onSurface,
  },
  cardMetaRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMetaText: {
    fontSize: theme.font.sm,
    color: theme.color.onSurfaceSecondary,
  },
});
