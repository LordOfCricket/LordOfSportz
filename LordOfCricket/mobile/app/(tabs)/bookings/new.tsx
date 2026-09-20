import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput as RNTextInput,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { randomUUID } from 'expo-crypto'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useAvailability, useCreateBooking } from '../../../src/hooks/useBooking'
import { Colors, Spacing, Typography } from '../../../src/constants/colors'
import { toGroundDateStr } from '../../../src/utils/groundTime'

type Step = 'date' | 'slot' | 'details' | 'confirm'

export default function NewBookingScreen() {
  const router = useRouter()
  const { publicGroundId, groundName } = useLocalSearchParams<{ publicGroundId?: string; groundName?: string }>()
  const [step, setStep] = useState<Step>('date')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(null)
  const [notes, setNotes] = useState('')
  const [expectedPlayers, setExpectedPlayers] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  const { data: availability, isLoading: isLoadingAvailability, isError: isAvailabilityError, refetch: refetchAvailability } =
    useAvailability(selectedDate ? toGroundDateStr(selectedDate) : null, publicGroundId, step !== 'date')

  const createBooking = useCreateBooking()

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false)
    if (date) {
      // Prevent selecting past dates (compare dates only, not time)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const selectedDateOnly = new Date(date)
      selectedDateOnly.setHours(0, 0, 0, 0)

      if (selectedDateOnly < today) {
        Alert.alert('Invalid Date', 'Please select a future date')
        return
      }
      setSelectedDate(date)
      setStep('slot')
    }
  }

  const handleSlotSelect = (slot: any) => {
    setSelectedSlot(slot)
  }

  const handleContinueFromSlot = () => {
    if (selectedSlot) setStep('details')
  }

  const handleConfirm = async () => {
    if (!selectedDate || !selectedSlot) {
      Alert.alert('Missing Information', 'Please complete all steps')
      return
    }

    try {
      // Generate clientActionId ONCE per user action
      // This UUID will be reused if TanStack Query retries the request
      const clientActionId = randomUUID()

      await createBooking.mutateAsync({
        startTime: selectedSlot.startTime,
        expectedPlayers: expectedPlayers ? parseInt(expectedPlayers, 10) : undefined,
        contactPhone: contactPhone || undefined,
        notes: notes || undefined,
        clientActionId,
        publicGroundId,
      })

      Alert.alert('Success', 'Booking confirmed!', [
        {
          text: 'View Bookings',
          onPress: () => {
            router.push('/(tabs)/bookings')
          },
        },
      ])
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error.message || 'Booking failed'
      Alert.alert('Booking Failed', errorMsg)
    }
  }

  return (
    <View style={styles.container}>
      {groundName && (
        <View style={styles.groundBanner}>
          <Text style={styles.groundBannerText}>Booking at {groundName}</Text>
        </View>
      )}

      {step === 'date' && (
        <DateSelectionStep
          selectedDate={selectedDate}
          onShowPicker={() => setShowDatePicker(true)}
          showPicker={showDatePicker}
          onDateChange={handleDateChange}
        />
      )}

      {step === 'slot' && (
        <SlotSelectionStep
          date={selectedDate!}
          availability={availability}
          isLoading={isLoadingAvailability}
          isError={isAvailabilityError}
          onRetry={() => refetchAvailability()}
          selectedSlot={selectedSlot}
          onSlotSelect={handleSlotSelect}
          onContinue={handleContinueFromSlot}
          onBack={() => setStep('date')}
        />
      )}

      {step === 'details' && (
        <BookingDetailsStep
          notes={notes}
          onNotesChange={setNotes}
          expectedPlayers={expectedPlayers}
          onPlayersChange={setExpectedPlayers}
          contactPhone={contactPhone}
          onPhoneChange={setContactPhone}
          onBack={() => setStep('slot')}
          onNext={() => setStep('confirm')}
        />
      )}

      {step === 'confirm' && (
        <BookingConfirmStep
          selectedDate={selectedDate!}
          selectedSlot={selectedSlot!}
          notes={notes}
          expectedPlayers={expectedPlayers}
          contactPhone={contactPhone}
          isSubmitting={createBooking.isPending}
          onBack={() => setStep('details')}
          onConfirm={handleConfirm}
        />
      )}
    </View>
  )
}

function DateSelectionStep({
  selectedDate,
  onShowPicker,
  showPicker,
  onDateChange,
}: {
  selectedDate: Date | null
  onShowPicker: () => void
  showPicker: boolean
  onDateChange: (event: any, date?: Date) => void
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <ScrollView style={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepCounter} accessibilityLabel="Step 1 of 4">Step 1 of 4</Text>
      <Text style={styles.stepTitle}>Select Date</Text>
      <Text style={styles.stepDescription}>Choose a date within the next 30 days</Text>

      <TouchableOpacity style={styles.dateButton} onPress={onShowPicker}>
        <Text style={styles.dateButtonText}>
          {selectedDate
            ? selectedDate.toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : 'Tap to select date'}
        </Text>
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={selectedDate || today}
          mode="date"
          display="spinner"
          onChange={onDateChange}
          minimumDate={today}
          maximumDate={new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)}
        />
      )}

      {selectedDate && (
        <TouchableOpacity style={styles.nextButton} onPress={() => {}}>
          <Text style={styles.nextButtonText}>Continue</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  )
}

function SlotSelectionStep({
  date,
  availability,
  isLoading,
  isError,
  onRetry,
  selectedSlot,
  onSlotSelect,
  onContinue,
  onBack,
}: {
  date: Date
  availability: any
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  selectedSlot: any
  onSlotSelect: (slot: any) => void
  onContinue: () => void
  onBack: () => void
}) {
  const slots = availability?.slots || []
  const hasAvailable = slots.some((s: any) => s.status === 'AVAILABLE')

  return (
    <ScrollView style={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepCounter} accessibilityLabel="Step 2 of 4">Step 2 of 4</Text>
      <Text style={styles.stepTitle}>Choose an Available Slot</Text>
      <Text style={styles.stepDescription}>
        {date.toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' })}
      </Text>

      {isLoading ? (
        <View style={styles.inlineState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading available slots...</Text>
        </View>
      ) : isError ? (
        <View style={styles.inlineState}>
          <Text style={styles.errorText}>Could not load availability for this date.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : slots.length === 0 ? (
        <View style={styles.inlineState}>
          <Text style={styles.errorText}>No available slots for this date.</Text>
        </View>
      ) : (
        <View style={styles.slotsContainer}>
          {!hasAvailable && <Text style={styles.errorText}>No available slots for this date.</Text>}
          {slots.map((slot: any) => {
            const startTime = new Date(slot.startTime)
            const endTime = new Date(slot.endTime)
            const isAvailable = slot.status === 'AVAILABLE'
            const isSelected = isAvailable && selectedSlot?.startTime === slot.startTime

            return (
              <TouchableOpacity
                key={`${slot.startTime}-${slot.endTime}`}
                style={[
                  styles.slotButton,
                  isSelected && styles.slotButtonSelected,
                  !isAvailable && styles.slotButtonDisabled,
                ]}
                onPress={() => isAvailable && onSlotSelect(slot)}
                disabled={!isAvailable}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: !isAvailable }}
              >
                <Text
                  style={[
                    styles.slotText,
                    isSelected && styles.slotTextSelected,
                    !isAvailable && styles.slotTextDisabled,
                  ]}
                >
                  {startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {endTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </Text>
                {isAvailable && slot.price != null && (
                  <Text style={[styles.slotPrice, isSelected && styles.slotTextSelected]}>₹{slot.price}</Text>
                )}
                <View style={styles.slotStatusRow}>
                  {isSelected && <Text style={styles.slotSelectedBadge}>✓ SELECTED</Text>}
                  <Text
                    style={[
                      styles.slotStatusText,
                      isSelected && styles.slotTextSelected,
                      !isAvailable && styles.slotTextDisabled,
                    ]}
                  >
                    {isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      <View style={styles.buttonGroup}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextButton, !selectedSlot && styles.buttonDisabled]}
          onPress={onContinue}
          disabled={!selectedSlot}
        >
          <Text style={styles.nextButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function BookingDetailsStep({
  notes,
  onNotesChange,
  expectedPlayers,
  onPlayersChange,
  contactPhone,
  onPhoneChange,
  onBack,
  onNext,
}: {
  notes: string
  onNotesChange: (text: string) => void
  expectedPlayers: string
  onPlayersChange: (text: string) => void
  contactPhone: string
  onPhoneChange: (text: string) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <ScrollView style={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepCounter} accessibilityLabel="Step 3 of 4">Step 3 of 4</Text>
      <Text style={styles.stepTitle}>Booking Details</Text>
      <Text style={styles.stepDescription}>Add optional information</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Number of Players (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 11"
          keyboardType="number-pad"
          value={expectedPlayers}
          onChangeText={onPlayersChange}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Contact Phone (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Your phone number"
          keyboardType="phone-pad"
          value={contactPhone}
          onChangeText={onPhoneChange}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="Any additional information"
          multiline
          numberOfLines={4}
          value={notes}
          onChangeText={onNotesChange}
        />
      </View>

      <View style={styles.buttonGroup}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.nextButton} onPress={onNext}>
          <Text style={styles.nextButtonText}>Review & Confirm</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function BookingConfirmStep({
  selectedDate,
  selectedSlot,
  notes,
  expectedPlayers,
  contactPhone,
  isSubmitting,
  onBack,
  onConfirm,
}: {
  selectedDate: Date
  selectedSlot: any
  notes: string
  expectedPlayers: string
  contactPhone: string
  isSubmitting: boolean
  onBack: () => void
  onConfirm: () => void
}) {
  const startTime = new Date(selectedSlot.startTime)
  const endTime = new Date(selectedSlot.endTime)

  return (
    <ScrollView style={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepCounter} accessibilityLabel="Step 4 of 4">Step 4 of 4</Text>
      <Text style={styles.stepTitle}>Confirm Booking</Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Date</Text>
          <Text style={styles.summaryValue}>
            {selectedDate.toLocaleDateString('en-IN', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Time</Text>
          <Text style={styles.summaryValue}>
            {startTime.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            -{' '}
            {endTime.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {expectedPlayers && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Players</Text>
            <Text style={styles.summaryValue}>{expectedPlayers}</Text>
          </View>
        )}

        {contactPhone && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Phone</Text>
            <Text style={styles.summaryValue}>{contactPhone}</Text>
          </View>
        )}

        {notes && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Notes</Text>
            <Text style={styles.summaryValue}>{notes}</Text>
          </View>
        )}
      </View>

      <View style={styles.buttonGroup}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} disabled={isSubmitting}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmButton, isSubmitting && styles.buttonDisabled]}
          onPress={onConfirm}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <Text style={styles.confirmButtonText}>Confirm Booking</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

// Re-export TextInput
const TextInput = RNTextInput

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  groundBanner: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  groundBannerText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
  },
  stepContainer: {
    flex: 1,
    padding: Spacing.lg,
  },
  stepCounter: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  stepTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  stepDescription: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  dateButton: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.primary,
    marginBottom: Spacing.lg,
  },
  dateButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    textAlign: 'center',
    fontWeight: Typography.fontWeight.bold,
  },
  inlineState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  loadingText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  errorText: {
    fontSize: Typography.fontSize.base,
    color: Colors.error,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  retryButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.white,
    textAlign: 'center',
    fontWeight: Typography.fontWeight.bold,
  },
  slotsContainer: {
    marginVertical: Spacing.lg,
    gap: Spacing.md,
  },
  slotButton: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  slotButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  slotButtonDisabled: {
    backgroundColor: Colors.gray[100],
    borderColor: Colors.gray[200],
    opacity: 0.6,
  },
  slotTextDisabled: {
    color: Colors.textTertiary,
  },
  slotText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.bold,
  },
  slotPrice: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  slotStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  slotStatusText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.success,
  },
  slotSelectedBadge: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  slotTextSelected: {
    color: Colors.white,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    fontWeight: Typography.fontWeight.bold,
    marginBottom: Spacing.sm,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },
  multilineInput: {
    textAlignVertical: 'top',
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.bold,
  },
  summaryValue: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.bold,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginVertical: Spacing.lg,
  },
  backButton: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.primary,
    paddingVertical: Spacing.lg,
  },
  backButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    textAlign: 'center',
    fontWeight: Typography.fontWeight.bold,
  },
  nextButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: Spacing.lg,
  },
  nextButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.white,
    textAlign: 'center',
    fontWeight: Typography.fontWeight.bold,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: Colors.success,
    borderRadius: 12,
    paddingVertical: Spacing.lg,
  },
  confirmButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.white,
    textAlign: 'center',
    fontWeight: Typography.fontWeight.bold,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
