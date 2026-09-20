import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useMyBookings } from '../../../src/hooks/useBooking'
import { Colors, Spacing, Typography } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { EmptyState } from '../../../src/components/EmptyState'
import { Booking } from '../../../src/types'

function formatPrice(n: number) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

export default function BookingsScreen() {
  const router = useRouter()
  const { data: bookings = [], isLoading, isError, error, refetch } = useMyBookings()

  const handleNewBooking = () => {
    router.push('/(tabs)/bookings/new')
  }

  const handleViewBooking = (publicBookingId: string) => {
    router.push(`/(tabs)/bookings/${publicBookingId}`)
  }

  const isUpcoming = (booking: Booking) => {
    return new Date(booking.startTime) > new Date() && booking.status === 'CONFIRMED'
  }

  const isPast = (booking: Booking) => {
    return new Date(booking.endTime) <= new Date() && booking.status === 'CONFIRMED'
  }

  const upcomingBookings = bookings.filter(isUpcoming)
  const pastBookings = bookings.filter(isPast)
  const cancelledBookings = bookings.filter((b: Booking) => b.status === 'CANCELLED')

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isError) {
    return (
      <ErrorScreen
        title="Failed to Load Bookings"
        message={error?.message || 'Unable to fetch your bookings'}
        onRetry={() => refetch()}
      />
    )
  }

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon="📅"
        title="No Bookings Yet"
        message="Book a ground for your next cricket match"
        actionLabel="Book Now"
        onAction={handleNewBooking}
      />
    )
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>My Bookings</Text>
        <TouchableOpacity style={styles.newBookingBtn} onPress={handleNewBooking}>
          <Text style={styles.newBookingText}>+ New Booking</Text>
        </TouchableOpacity>
      </View>

      {upcomingBookings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming</Text>
          {upcomingBookings.map((booking: Booking) => (
            <BookingCard
              key={booking.publicBookingId}
              booking={booking}
              onPress={() => handleViewBooking(booking.publicBookingId)}
            />
          ))}
        </View>
      )}

      {pastBookings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Completed</Text>
          {pastBookings.map((booking: Booking) => (
            <BookingCard
              key={booking.publicBookingId}
              booking={booking}
              onPress={() => handleViewBooking(booking.publicBookingId)}
            />
          ))}
        </View>
      )}

      {cancelledBookings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cancelled</Text>
          {cancelledBookings.map((booking: Booking) => (
            <BookingCard
              key={booking.publicBookingId}
              booking={booking}
              onPress={() => handleViewBooking(booking.publicBookingId)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  )
}

interface BookingCardProps {
  booking: Booking
  onPress: () => void
}

function statusColorFor(displayStatus: Booking['displayStatus']): string {
  if (displayStatus === 'APPROVED') return Colors.success
  if (displayStatus === 'CANCELLED') return Colors.error
  return Colors.textSecondary // COMPLETED
}

function BookingCard({ booking, onPress }: BookingCardProps) {
  const startDate = new Date(booking.startTime)
  const endDate = new Date(booking.endTime)

  const dateStr = startDate.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  const timeStr = `${startDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })} - ${endDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`

  const statusColor = statusColorFor(booking.displayStatus)

  return (
    <TouchableOpacity
      style={[styles.bookingCard, { borderLeftColor: statusColor, borderLeftWidth: 4 }]}
      onPress={onPress}
    >
      <View style={styles.bookingHeader}>
        <View style={styles.bookingInfo}>
          {booking.ground ? (
            <Text style={styles.bookingGround} numberOfLines={1}>
              {booking.ground.name}
              {booking.ground.city ? ` · ${booking.ground.city}` : ''}
            </Text>
          ) : null}
          <Text style={styles.bookingDate}>{dateStr}</Text>
          <Text style={styles.bookingTime}>{timeStr}</Text>
          {booking.purpose && <Text style={styles.bookingPurpose}>{booking.purpose}</Text>}
        </View>
        <Text style={[styles.bookingStatus, { color: statusColor }]}>{booking.displayStatus}</Text>
      </View>

      <View style={styles.bookingMetaRow}>
        {booking.amount != null && <Text style={styles.bookingAmount}>{formatPrice(booking.amount)}</Text>}
        {booking.expectedPlayers ? (
          <Text style={styles.bookingDetail}>👥 {booking.expectedPlayers} players</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  newBookingBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: 8,
  },
  newBookingText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  bookingCard: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  bookingInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  bookingGround: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: 2,
  },
  bookingDate: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  bookingTime: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  bookingPurpose: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  bookingStatus: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
  bookingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  bookingAmount: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.secondary,
  },
  bookingDetail: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
})
