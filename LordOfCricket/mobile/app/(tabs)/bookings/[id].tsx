import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useCancelBooking, useMyBookings } from '../../../src/hooks/useBooking'
import { Colors, Spacing, Typography } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { Booking } from '../../../src/types'

function formatPrice(n: number) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

export default function BookingDetailsScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams()
  const { data: bookings = [], isLoading } = useMyBookings()
  const cancelBooking = useCancelBooking()
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  const booking = bookings.find((b: Booking) => b.publicBookingId === id) as Booking | undefined

  if (isLoading) {
    return <LoadingScreen />
  }

  if (!booking) {
    return (
      <ErrorScreen
        title="Booking Not Found"
        message="This booking could not be found"
        onRetry={() => router.back()}
        retryLabel="Go Back"
      />
    )
  }

  const startDate = new Date(booking.startTime)
  const endDate = new Date(booking.endTime)
  const isUpcoming = startDate > new Date() && booking.status === 'CONFIRMED'
  const canCancel = isUpcoming

  const handleCancelConfirm = async () => {
    try {
      await cancelBooking.mutateAsync(booking.publicBookingId)
      Alert.alert('Success', 'Booking cancelled', [
        {
          text: 'OK',
          onPress: () => router.push('/(tabs)/bookings'),
        },
      ])
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error.message || 'Cancellation failed'
      Alert.alert('Error', errorMsg)
    }
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Booking Details</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.statusBadge}>
          <Text style={[styles.statusText, { color: getStatusColor(booking.displayStatus) }]}>
            {booking.displayStatus}
          </Text>
        </View>

        {booking.ground ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ground</Text>
            <TouchableOpacity
              onPress={() => router.push(`/(tabs)/grounds/${booking.ground!.publicGroundId}` as any)}
              accessibilityRole="button"
            >
              <Text style={styles.groundLink}>{booking.ground.name}</Text>
            </TouchableOpacity>
            {booking.ground.city ? <Text style={styles.detailValue}>{booking.ground.city}</Text> : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date & Time</Text>
          <DetailRow
            label="Date"
            value={startDate.toLocaleDateString('en-IN', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          />
          <DetailRow
            label="Time"
            value={`${startDate.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })} - ${endDate.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}`}
          />
          <DetailRow
            label="Duration"
            value={`${Math.round((endDate.getTime() - startDate.getTime()) / 60000)} minutes`}
          />
        </View>

        {booking.amount != null && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Price</Text>
            <DetailRow label="Amount" value={formatPrice(booking.amount)} />
          </View>
        )}

        {booking.purpose && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Purpose</Text>
            <Text style={styles.detailValue}>{booking.purpose}</Text>
          </View>
        )}

        {booking.expectedPlayers && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Players</Text>
            <DetailRow label="Expected" value={booking.expectedPlayers.toString()} />
          </View>
        )}

        {booking.contactPhone && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact</Text>
            <DetailRow label="Phone" value={booking.contactPhone} />
            {booking.contactEmail && <DetailRow label="Email" value={booking.contactEmail} />}
          </View>
        )}

        {booking.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.detailValue}>{booking.notes}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Booking Info</Text>
          <DetailRow label="Booking ID" value={booking.publicBookingId} />
          <DetailRow label="Created" value={new Date(booking.createdAt).toLocaleDateString('en-IN')} />
          {booking.cancelledAt && (
            <DetailRow label="Cancelled" value={new Date(booking.cancelledAt).toLocaleDateString('en-IN')} />
          )}
        </View>

        {canCancel && (
          <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCancelDialog(true)}>
            <Text style={styles.cancelButtonText}>Cancel Booking</Text>
          </TouchableOpacity>
        )}
      </View>

      {showCancelDialog && (
        <CancelConfirmDialog
          isSubmitting={cancelBooking.isPending}
          onConfirm={handleCancelConfirm}
          onCancel={() => setShowCancelDialog(false)}
        />
      )}
    </ScrollView>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

function CancelConfirmDialog({
  isSubmitting,
  onConfirm,
  onCancel,
}: {
  isSubmitting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <View style={styles.dialogOverlay}>
      <View style={styles.dialogContent}>
        <Text style={styles.dialogTitle}>Cancel Booking?</Text>
        <Text style={styles.dialogMessage}>
          Are you sure you want to cancel this booking? This action cannot be undone.
        </Text>

        <View style={styles.dialogButtons}>
          <TouchableOpacity
            style={[styles.dialogButton, styles.dialogButtonSecondary]}
            onPress={onCancel}
            disabled={isSubmitting}
          >
            <Text style={styles.dialogButtonTextSecondary}>Keep Booking</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dialogButton, styles.dialogButtonDanger]}
            onPress={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Text style={styles.dialogButtonTextDanger}>Cancel Booking</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'APPROVED':
      return Colors.success
    case 'COMPLETED':
      return Colors.textSecondary
    case 'CANCELLED':
      return Colors.error
    default:
      return Colors.text
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  backButton: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
    marginRight: Spacing.md,
  },
  headerTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    flex: 1,
  },
  card: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 12,
    padding: Spacing.lg,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    marginBottom: Spacing.lg,
  },
  statusText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
  section: {
    marginBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  groundLink: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  detailLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },
  cancelButton: {
    backgroundColor: Colors.error,
    borderRadius: 12,
    paddingVertical: Spacing.lg,
    marginTop: Spacing.lg,
  },
  cancelButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.white,
    textAlign: 'center',
    fontWeight: Typography.fontWeight.bold,
  },
  dialogOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogContent: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 12,
    padding: Spacing.lg,
    width: '85%',
  },
  dialogTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  dialogMessage: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  dialogButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: 8,
  },
  dialogButtonSecondary: {
    backgroundColor: Colors.border,
  },
  dialogButtonDanger: {
    backgroundColor: Colors.error,
  },
  dialogButtonTextSecondary: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    textAlign: 'center',
    fontWeight: Typography.fontWeight.bold,
  },
  dialogButtonTextDanger: {
    fontSize: Typography.fontSize.base,
    color: Colors.white,
    textAlign: 'center',
    fontWeight: Typography.fontWeight.bold,
  },
})
