import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useUmpireProfile, useUpdateUmpireProfile } from '../../src/hooks/useUmpireProfile'
import { getErrorMessage } from '../../src/utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

const BIO_MAX = 500

export default function UmpireProfileEditScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data: profile, isLoading, isError, refetch } = useUmpireProfile()
  const mutation = useUpdateUmpireProfile()

  const [bio, setBio] = useState('')
  const [isAvailable, setIsAvailable] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seeded, setSeeded] = useState(false)

  // Seed the form once from the server value; a later background refetch
  // must not clobber in-progress edits.
  useEffect(() => {
    if (profile && !seeded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBio(profile.bio ?? '')
      setIsAvailable(profile.is_available)
      setSeeded(true)
    }
  }, [profile, seeded])

  const dirty =
    seeded && (bio.trim() !== (profile?.bio ?? '').trim() || isAvailable !== profile?.is_available)
  const bioTooLong = bio.length > BIO_MAX
  const canSave = dirty && !bioTooLong && !mutation.isPending

  const handleSave = async () => {
    if (!canSave) return
    setError(null)
    try {
      await mutation.mutateAsync({ bio: bio.trim(), isAvailable })
      router.back()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={LocColors.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit profile</Text>
        <View style={{ width: 26 }} />
      </View>

      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : isError ? (
        <View style={styles.centerPad}>
          <Text style={styles.errText}>Couldn’t load your profile.</Text>
          <TouchableOpacity style={styles.saveBtn} onPress={() => refetch()} accessibilityRole="button">
            <Text style={styles.saveBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textArea, bioTooLong && styles.inputError]}
            value={bio}
            onChangeText={setBio}
            placeholder="Short introduction — background, formats you officiate, region…"
            placeholderTextColor={LocColors.faint}
            multiline
            maxLength={BIO_MAX + 40}
            textAlignVertical="top"
            accessibilityLabel="Bio"
          />
          <Text style={[styles.counter, bioTooLong && styles.counterError]}>
            {bio.length}/{BIO_MAX}
          </Text>
          {bioTooLong && <Text style={styles.fieldError}>Bio must be {BIO_MAX} characters or fewer.</Text>}

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.label}>Available for matches</Text>
              <Text style={styles.help}>Turn off to stop appearing for new match assignments.</Text>
            </View>
            <Switch
              value={isAvailable}
              onValueChange={setIsAvailable}
              trackColor={{ true: LocColors.green, false: LocColors.borderSoft }}
              thumbColor={LocColors.surface}
            />
          </View>

          {error && (
            <View style={styles.banner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#B91C1C" />
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
          >
            {mutation.isPending ? (
              <ActivityIndicator color={LocColors.surface} />
            ) : (
              <Text style={styles.saveBtnText}>{dirty ? 'Save changes' : 'No changes'}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: LocColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: LocColors.border,
  },
  headerTitle: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  content: { padding: Spacing.lg, gap: Spacing.sm },
  label: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  help: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    backgroundColor: LocColors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.fontSize.sm,
    color: LocColors.ink,
  },
  textArea: { minHeight: 120 },
  inputError: { borderColor: '#DC2626' },
  counter: { alignSelf: 'flex-end', fontSize: Typography.fontSize.xs, color: LocColors.faint },
  counterError: { color: '#DC2626' },
  fieldError: { fontSize: Typography.fontSize.xs, color: '#DC2626' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: LocColors.border,
  },
  switchText: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FEF2F2',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  bannerText: { flex: 1, fontSize: Typography.fontSize.xs, color: '#B91C1C' },
  saveBtn: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  errText: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
})
