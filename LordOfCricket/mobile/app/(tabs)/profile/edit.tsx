import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useMyPlayer, useUpdateMyPlayer } from '../../../src/hooks/usePlayer'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { PLAYING_ROLES, BATTING_STYLES, BOWLING_STYLES } from '../../../src/domain/playerEnums'
import { formatRole, formatBattingStyle, formatBowlingStyle } from '../../../src/utils/playerFormatting'
import { validatePlayerFields } from '../../../src/utils/playerValidation'
import { getErrorMessage } from '../../../src/utils/errors'
import { EditablePlayerFields } from '../../../src/types'

function toDateOnlyString(date: Date): string {
  // Local calendar components only — a date-of-birth picker selection has
  // no timezone/business-clock semantics to reconcile, so no UTC round-trip
  // (avoids the same date-shifting bug class found in the booking flow).
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function EditProfileScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const playerQuery = useMyPlayer()
  const updateMutation = useUpdateMyPlayer()

  const player = playerQuery.data

  const [form, setForm] = useState<EditablePlayerFields | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Initialize the editable form once the player loads (only once — this
  // screen doesn't need to re-sync mid-edit if a background refetch occurs).
  const initialForm = useMemo<EditablePlayerFields | null>(() => {
    if (!player) return null
    return {
      name: player.name,
      nickname: player.nickname ?? null,
      role: player.role ?? null,
      batting_style: player.batting_style ?? null,
      bowling_style: player.bowling_style ?? null,
      jersey_number: player.jersey_number ?? null,
      date_of_birth: player.date_of_birth ?? null,
      is_wicket_keeper: player.is_wicket_keeper ?? false,
      city: player.city ?? null,
      state: player.state ?? null,
      address_line: player.address_line ?? null,
      postal_code: player.postal_code ?? null,
      bio: player.bio ?? null,
    }
  }, [player])

  const fields = form ?? initialForm

  if (playerQuery.isLoading) {
    return <LoadingScreen />
  }

  if (playerQuery.isError || !fields) {
    return (
      <ErrorScreen
        title="Failed to Load"
        message="Could not load your profile. Please try again."
        onRetry={() => playerQuery.refetch()}
      />
    )
  }

  const setField = <K extends keyof EditablePlayerFields>(key: K, value: EditablePlayerFields[K]) => {
    setForm({ ...fields, [key]: value })
    if (errors[key]) {
      const next = { ...errors }
      delete next[key]
      setErrors(next)
    }
  }

  const handleSave = async () => {
    const result = validatePlayerFields(fields)
    if (!result.valid) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    try {
      await updateMutation.mutateAsync(fields)
      router.back()
    } catch (err) {
      Alert.alert('Could Not Save', getErrorMessage(err))
    }
  }

  // QA fix: was `new Date(fields.date_of_birth)` — a "YYYY-MM-DD" string
  // parses as UTC midnight, and the native picker then renders it using the
  // device's own local timezone, showing the previous calendar day on any
  // negative-UTC-offset device. Parsing the digits directly and building
  // via the local numeric Date constructor avoids that round-trip, mirroring
  // toDateOnlyString's own reasoning just above for the write path.
  const dobDateMatch = fields.date_of_birth ? /^(\d{4})-(\d{2})-(\d{2})/.exec(fields.date_of_birth) : null
  const dobDate = dobDateMatch
    ? new Date(Number(dobDateMatch[1]), Number(dobDateMatch[2]) - 1, Number(dobDateMatch[3]))
    : null

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel editing">
          <Text style={styles.headerAction}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={updateMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel="Save profile changes"
        >
          {updateMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={[styles.headerAction, styles.headerActionPrimary]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Field label="Name" error={errors.name}>
          <TextInput
            style={styles.input}
            value={fields.name ?? ''}
            onChangeText={(v) => setField('name', v)}
            placeholder="Your full name"
            placeholderTextColor={Colors.textTertiary}
          />
        </Field>

        <Field label="Nickname" error={errors.nickname}>
          <TextInput
            style={styles.input}
            value={fields.nickname ?? ''}
            onChangeText={(v) => setField('nickname', v || null)}
            placeholder="Optional"
            placeholderTextColor={Colors.textTertiary}
            maxLength={50}
          />
        </Field>

        <Field label="Playing Role" error={errors.role}>
          <ChipSelector
            options={PLAYING_ROLES}
            value={fields.role}
            onChange={(v) => setField('role', v)}
            formatOption={formatRole}
          />
        </Field>

        <Field label="Batting Style" error={errors.batting_style}>
          <ChipSelector
            options={BATTING_STYLES}
            value={fields.batting_style}
            onChange={(v) => setField('batting_style', v)}
            formatOption={formatBattingStyle}
          />
        </Field>

        <Field label="Bowling Style" error={errors.bowling_style}>
          <ChipSelector
            options={BOWLING_STYLES}
            value={fields.bowling_style}
            onChange={(v) => setField('bowling_style', v)}
            formatOption={formatBowlingStyle}
          />
        </Field>

        <Field label="Jersey Number" error={errors.jersey_number}>
          <TextInput
            style={styles.input}
            value={fields.jersey_number != null ? String(fields.jersey_number) : ''}
            onChangeText={(v) => {
              const trimmed = v.trim()
              if (!trimmed) return setField('jersey_number', null)
              const parsed = parseInt(trimmed, 10)
              setField('jersey_number', Number.isNaN(parsed) ? fields.jersey_number ?? null : parsed)
            }}
            placeholder="e.g. 7"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="number-pad"
            maxLength={3}
          />
        </Field>

        <Field label="Date of Birth" error={errors.date_of_birth}>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            accessibilityLabel="Choose date of birth"
          >
            <Text style={fields.date_of_birth ? styles.inputText : styles.inputPlaceholder}>
              {fields.date_of_birth || 'Not set'}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <>
              <DateTimePicker
                value={dobDate || new Date(2000, 0, 1)}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                minimumDate={new Date(1900, 0, 1)}
                onChange={(event, date) => {
                  // QA fix: with display="spinner", iOS fires onChange on
                  // EVERY wheel tick while scrolling, not just once on
                  // confirm (unlike Android, whose picker is always a
                  // single-shot native dialog). Closing unconditionally
                  // here made the picker vanish after the user's very first
                  // scroll tick, before they could actually pick a date —
                  // so only close automatically on Android; iOS gets an
                  // explicit Done button below instead.
                  if (Platform.OS === 'android') setShowDatePicker(false)
                  if (date) setField('date_of_birth', toDateOnlyString(date))
                }}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.datePickerDoneButton}
                  onPress={() => setShowDatePicker(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Done choosing date of birth"
                >
                  <Text style={styles.datePickerDoneButtonText}>Done</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </Field>

        <Field label="Wicketkeeper">
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>I play as a wicketkeeper</Text>
            <Switch
              value={!!fields.is_wicket_keeper}
              onValueChange={(v) => setField('is_wicket_keeper', v)}
              trackColor={{ true: Colors.primary }}
            />
          </View>
        </Field>

        <Field label="City" error={errors.city}>
          <TextInput
            style={styles.input}
            value={fields.city ?? ''}
            onChangeText={(v) => setField('city', v || null)}
            placeholder="Optional"
            placeholderTextColor={Colors.textTertiary}
            maxLength={100}
          />
        </Field>

        <Field label="State" error={errors.state}>
          <TextInput
            style={styles.input}
            value={fields.state ?? ''}
            onChangeText={(v) => setField('state', v || null)}
            placeholder="Optional"
            placeholderTextColor={Colors.textTertiary}
            maxLength={100}
          />
        </Field>

        <Field label="Address" error={errors.address_line}>
          <TextInput
            style={styles.input}
            value={fields.address_line ?? ''}
            onChangeText={(v) => setField('address_line', v || null)}
            placeholder="Optional"
            placeholderTextColor={Colors.textTertiary}
            maxLength={255}
          />
        </Field>

        <Field label="Postal Code" error={errors.postal_code}>
          <TextInput
            style={styles.input}
            value={fields.postal_code ?? ''}
            onChangeText={(v) => setField('postal_code', v || null)}
            placeholder="Optional"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="number-pad"
            maxLength={20}
          />
        </Field>

        <Field label="Bio" error={errors.bio} hint={`${(fields.bio ?? '').length}/280`}>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={fields.bio ?? ''}
            onChangeText={(v) => setField('bio', v || null)}
            placeholder="A short line about your cricket journey"
            placeholderTextColor={Colors.textTertiary}
            multiline
            numberOfLines={4}
            maxLength={280}
          />
        </Field>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      </View>
      {children}
      {error && (
        <View style={styles.errorRow}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  )
}

function ChipSelector<T extends string>({
  options,
  value,
  onChange,
  formatOption,
}: {
  options: readonly T[]
  value: T | null | undefined
  onChange: (value: T) => void
  formatOption: (v: T) => string | null
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const selected = value === option
        return (
          <TouchableOpacity
            key={option}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityLabel={formatOption(option) || option}
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{formatOption(option)}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  headerAction: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
    paddingVertical: Spacing.xs,
  },
  headerActionPrimary: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.bold,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  fieldLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
  },
  fieldHint: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    backgroundColor: Colors.backgroundAlt,
  },
  inputText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  inputPlaceholder: {
    fontSize: Typography.fontSize.base,
    color: Colors.textTertiary,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  switchLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  chipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  chipText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  chipTextSelected: {
    color: Colors.white,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
  },
  errorText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.error,
  },
  datePickerDoneButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  datePickerDoneButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  bottomSpacer: {
    height: Spacing['2xl'],
  },
})
