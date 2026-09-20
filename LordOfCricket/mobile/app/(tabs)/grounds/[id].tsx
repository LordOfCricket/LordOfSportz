import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  ActivityIndicator,
  Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useGroundDetail, useGroundAvailability } from '../../../src/hooks/useGrounds'
import { Colors, Spacing, Typography } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { FollowButton } from '../../../src/components/FollowButton'
import { GroundPhotoGallery } from '../../../src/components/GroundPhotoGallery'
import { shareEntity } from '../../../src/lib/shareEntity'
import { groundTodayDateStr } from '../../../src/utils/groundTime'

function formatSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Backend gives opening/closing as an integer hour (0–23); null means
// "platform default applies", never "closed" (ground.controller.js comment).
function formatHour(h: number) {
  const d = new Date()
  d.setHours(h, 0, 0, 0)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatPrice(n: number) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

export default function GroundDetailsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [refreshing, setRefreshing] = useState(false)

  const today = groundTodayDateStr()
  const { data: ground, isLoading, isError, refetch: refetchGround } = useGroundDetail(id || '')
  const {
    data: availability,
    isLoading: isAvailabilityLoading,
    isError: isAvailabilityError,
    refetch: refetchAvailability,
  } = useGroundAvailability(today, id)

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([refetchGround(), refetchAvailability()])
    setRefreshing(false)
  }

  if (!id) {
    return (
      <ErrorScreen title="Error" message="Ground ID is required" onRetry={() => router.back()} retryLabel="Go Back" />
    )
  }
  if (isLoading) return <LoadingScreen />
  if (isError) {
    return (
      <ErrorScreen
        title="Failed to Load"
        message="Could not load ground details. Please try again."
        onRetry={() => refetchGround()}
      />
    )
  }
  if (!ground) {
    return (
      <ErrorScreen
        title="Not Found"
        message="This ground could not be found."
        onRetry={() => router.back()}
        retryLabel="Go Back"
      />
    )
  }

  const slots = availability?.slots || []
  const amenities = ground.amenityCatalog?.length ? ground.amenityCatalog : ground.amenities || []
  const addressParts = [ground.addressLine, ground.city, ground.state, ground.postalCode].filter(Boolean)
  const hasHours = ground.openingHour != null && ground.closingHour != null

  const openLink = (url: string) => Linking.openURL(url).catch(() => {})

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing.lg }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() =>
            shareEntity({
              title: ground.name,
              message: `${ground.name}${ground.city ? ` — ${ground.city}` : ''} on Lord Of Cricket`,
              path: `/grounds/${id}`,
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Share this ground"
          hitSlop={8}
        >
          <MaterialCommunityIcons name="share-variant" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {ground.primaryPhoto && <Image source={{ uri: ground.primaryPhoto }} style={styles.groundImage} />}

      {/* Photo gallery — only renders when the ground has more than one photo
          (the hero above already shows the single/primary one). */}
      <GroundPhotoGallery photos={ground.photos ?? []} groundName={ground.name} />

      {/* Identity */}
      <View style={styles.card}>
        <Text style={styles.groundName}>{ground.name}</Text>
        {ground.ratingAvg != null ? (
          <Text style={styles.rating}>
            ★ {ground.ratingAvg.toFixed(1)}{' '}
            <Text style={styles.ratingCount}>
              ({ground.ratingCount} {ground.ratingCount === 1 ? 'review' : 'reviews'})
            </Text>
          </Text>
        ) : (
          <Text style={styles.ratingCount}>No reviews yet</Text>
        )}
        {addressParts.length > 0 && <Text style={styles.address}>📍 {addressParts.join(', ')}</Text>}
        <View style={styles.identityActions}>
          <FollowButton type="ground" publicGroundId={id} />
        </View>
      </View>

      {/* About */}
      {ground.description ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About</Text>
          <Text style={styles.bodyText}>{ground.description}</Text>
        </View>
      ) : null}

      {/* Opening hours */}
      {hasHours && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Opening Hours</Text>
          <Text style={styles.bodyText}>
            {formatHour(ground.openingHour as number)} – {formatHour(ground.closingHour as number)}
          </Text>
        </View>
      )}

      {/* Contact */}
      {(ground.phone || ground.email || ground.website) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contact</Text>
          {ground.phone ? (
            <TouchableOpacity onPress={() => openLink(`tel:${ground.phone}`)}>
              <Text style={styles.link}>📞 {ground.phone}</Text>
            </TouchableOpacity>
          ) : null}
          {ground.email ? (
            <TouchableOpacity onPress={() => openLink(`mailto:${ground.email}`)}>
              <Text style={styles.link}>✉️ {ground.email}</Text>
            </TouchableOpacity>
          ) : null}
          {ground.website ? (
            <TouchableOpacity onPress={() => openLink(ground.website as string)}>
              <Text style={styles.link} numberOfLines={1}>
                🌐 {ground.website}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Amenities */}
      {amenities.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Amenities</Text>
          <View style={styles.chipWrap}>
            {amenities.map((a, i) => (
              <View key={a.key || a.name || i} style={styles.chip}>
                <Text style={styles.chipText}>{a.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Pricing */}
      {ground.pricingSlots?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pricing</Text>
          {ground.pricingSlots.map((s, i) => (
            <View key={i} style={styles.pricingRow}>
              <Text style={styles.pricingTime}>
                {s.startTime} – {s.endTime}
              </Text>
              <Text style={styles.pricingPrice}>{formatPrice(s.price)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Today's Availability */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today&apos;s Availability</Text>

        {isAvailabilityLoading ? (
          <ActivityIndicator color={Colors.primary} style={styles.inlineLoader} />
        ) : isAvailabilityError ? (
          <View style={styles.availabilityErrorRow}>
            <Text style={styles.availabilityErrorText}>Could not load availability.</Text>
            <TouchableOpacity onPress={() => refetchAvailability()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : slots.length === 0 ? (
          <Text style={styles.emptySubtext}>No slots available for today.</Text>
        ) : (
          <View style={styles.slotsList}>
            {slots.map((slot: any, idx: number) => {
              const isAvailable = slot.status === 'AVAILABLE'
              return (
                <View
                  key={idx}
                  style={[styles.slotRow, isAvailable ? styles.slotRowAvailable : styles.slotRowUnavailable]}
                >
                  <Text style={styles.slotRowTime}>
                    {formatSlotTime(slot.startTime)} - {formatSlotTime(slot.endTime)}
                  </Text>
                  <View style={styles.slotRight}>
                    {slot.price != null && isAvailable ? (
                      <Text style={styles.slotPrice}>{formatPrice(slot.price)}</Text>
                    ) : null}
                    <Text
                      style={[
                        styles.slotRowStatus,
                        isAvailable ? styles.slotRowStatusAvailable : styles.slotRowStatusUnavailable,
                      ]}
                    >
                      {isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionSection}>
        <TouchableOpacity
          style={styles.bookButton}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/bookings/new',
              params: { publicGroundId: id, groundName: ground.name },
            } as any)
          }
        >
          <Text style={styles.bookButtonText}>Book a Slot</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.proposalsButton}
          onPress={() => router.push(`/(tabs)/grounds/${id}/proposals`)}
          accessibilityLabel="View open proposals"
        >
          <Text style={styles.proposalsButtonText}>View Proposals</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backButton: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },
  groundImage: {
    width: '100%',
    height: 200,
    marginBottom: Spacing.md,
  },
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
  },
  groundName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  rating: {
    fontSize: Typography.fontSize.base,
    color: Colors.secondary,
    fontWeight: Typography.fontWeight.semibold,
    marginBottom: Spacing.sm,
  },
  ratingCount: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.normal,
  },
  address: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  identityActions: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
  cardTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  bodyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  link: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
    marginBottom: Spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  pricingTime: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  pricingPrice: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.secondary,
  },
  inlineLoader: {
    marginVertical: Spacing.md,
  },
  availabilityErrorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  availabilityErrorText: {
    fontSize: Typography.fontSize.base,
    color: Colors.error,
    flex: 1,
  },
  retryText: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },
  emptySubtext: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },
  slotsList: {
    gap: Spacing.sm,
  },
  slotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
  },
  slotRowAvailable: {
    backgroundColor: Colors.success,
    opacity: 0.15,
    borderColor: Colors.success,
  },
  slotRowUnavailable: {
    backgroundColor: Colors.gray[100],
    borderColor: Colors.gray[300],
  },
  slotRowTime: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },
  slotRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  slotPrice: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  slotRowStatus: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
  },
  slotRowStatusAvailable: {
    color: Colors.statusOngoing,
  },
  slotRowStatusUnavailable: {
    color: Colors.textTertiary,
  },
  actionSection: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  bookButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  bookButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
  },
  proposalsButton: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  proposalsButtonText: {
    color: Colors.primary,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
  },
})
