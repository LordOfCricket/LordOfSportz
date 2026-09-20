import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { FormField } from '../../../src/components/owner/FormField'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { useCreateOwnerMatch } from '../../../src/hooks/useOwnerMatches'
import { useDiscoverTeams } from '../../../src/hooks/useTeams'
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue'
import { toGroundDateStr } from '../../../src/utils/groundTime'
import { formatDateLong, formatTime } from '../../../src/utils/bookingFormat'
import { getErrorMessage } from '../../../src/utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

interface TeamRef {
  id: number
  name: string
  short_name: string
}

export default function NewOwnerMatchScreen() {
  const router = useRouter()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const create = useCreateOwnerMatch(publicGroundId ?? '')

  const [teamA, setTeamA] = useState<TeamRef | null>(null)
  const [teamB, setTeamB] = useState<TeamRef | null>(null)
  const [pickerFor, setPickerFor] = useState<'A' | 'B' | null>(null)
  const now = new Date()
  const [date, setDate] = useState<Date>(now)
  const [time, setTime] = useState<Date>(now)
  const [showDate, setShowDate] = useState(false)
  const [showTime, setShowTime] = useState(false)
  const [requiredUmpires, setRequiredUmpires] = useState('2')
  const [overs, setOvers] = useState('')
  const [error, setError] = useState<string | null>(null)

  const umpiresNum = Number(requiredUmpires.trim() || '0')
  const umpiresInvalid = !Number.isInteger(umpiresNum) || umpiresNum < 0
  const oversNum = overs.trim() ? Number(overs.trim()) : null
  const oversInvalid = oversNum != null && (!Number.isInteger(oversNum) || oversNum <= 0)
  const sameTeams = teamA != null && teamB != null && teamA.id === teamB.id
  const valid = teamA && teamB && !sameTeams && !umpiresInvalid && !oversInvalid

  const submit = async () => {
    if (!valid || create.isPending) return
    setError(null)
    const dateStr = toGroundDateStr(date)
    const hh = String(time.getHours()).padStart(2, '0')
    const mm = String(time.getMinutes()).padStart(2, '0')
    try {
      const { id } = await create.mutateAsync({
        teamAId: teamA!.id,
        teamBId: teamB!.id,
        matchDate: `${dateStr}T${hh}:${mm}:00`,
        requiredUmpires: umpiresNum,
        oversPerInnings: oversNum,
      })
      if (id) router.replace(`/(owner)/matches/${id}`)
      else router.back()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="New match" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to create a match." />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OwnerSubHeader title="New match" subtitle={activeGround?.name} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Team A">
          <TeamButton team={teamA} onPress={() => setPickerFor('A')} />
        </Field>
        <Field label="Team B">
          <TeamButton team={teamB} onPress={() => setPickerFor('B')} />
        </Field>
        {sameTeams ? <Text style={styles.fieldError}>Team A and Team B must be different.</Text> : null}

        <Field label="Date">
          <TouchableOpacity style={styles.pickBtn} onPress={() => setShowDate(true)} accessibilityRole="button">
            <MaterialCommunityIcons name="calendar" size={18} color={LocColors.green} />
            <Text style={styles.pickText}>{formatDateLong(date.toISOString())}</Text>
          </TouchableOpacity>
        </Field>
        <Field label="Start time">
          <TouchableOpacity style={styles.pickBtn} onPress={() => setShowTime(true)} accessibilityRole="button">
            <MaterialCommunityIcons name="clock-outline" size={18} color={LocColors.green} />
            <Text style={styles.pickText}>{formatTime(time.toISOString())}</Text>
          </TouchableOpacity>
        </Field>

        <FormField
          label="Required umpires"
          value={requiredUmpires}
          onChangeText={setRequiredUmpires}
          keyboardType="number-pad"
          maxLength={2}
          error={umpiresInvalid ? 'Enter a whole number (0 or more).' : null}
        />
        <FormField
          label="Overs per innings (optional)"
          value={overs}
          onChangeText={setOvers}
          keyboardType="number-pad"
          maxLength={3}
          error={oversInvalid ? 'Enter a positive whole number.' : null}
        />

        {error ? <Text style={styles.fieldError}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryBtn, (!valid || create.isPending) && styles.primaryBtnDisabled]}
          onPress={submit}
          disabled={!valid || create.isPending}
          accessibilityRole="button"
        >
          {create.isPending ? <ActivityIndicator color={LocColors.surface} /> : <Text style={styles.primaryBtnText}>Create match</Text>}
        </TouchableOpacity>
      </ScrollView>

      {pickerFor ? (
        <TeamPickerModal
          exclude={pickerFor === 'A' ? teamB?.id : teamA?.id}
          onClose={() => setPickerFor(null)}
          onPick={(t) => {
            if (pickerFor === 'A') setTeamA(t)
            else setTeamB(t)
            setPickerFor(null)
          }}
        />
      ) : null}

      {showDate ? (
        <DateTimePicker
          value={date}
          mode="date"
          minimumDate={new Date()}
          onChange={(e, selected) => {
            setShowDate(false)
            if (e.type === 'set' && selected) setDate(selected)
          }}
        />
      ) : null}
      {showTime ? (
        <DateTimePicker
          value={time}
          mode="time"
          is24Hour
          onChange={(e, selected) => {
            setShowTime(false)
            if (e.type === 'set' && selected) setTime(selected)
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

function TeamButton({ team, onPress }: { team: TeamRef | null; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.pickBtn} onPress={onPress} accessibilityRole="button" accessibilityLabel={team ? team.name : 'Select team'}>
      <MaterialCommunityIcons name="account-group-outline" size={18} color={LocColors.green} />
      <Text style={[styles.pickText, !team && styles.pickPlaceholder]}>{team ? team.name : 'Select team'}</Text>
      <MaterialCommunityIcons name="chevron-right" size={18} color={LocColors.faint} />
    </TouchableOpacity>
  )
}

function TeamPickerModal({
  exclude,
  onClose,
  onPick,
}: {
  exclude?: number
  onClose: () => void
  onPick: (team: TeamRef) => void
}) {
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const { data, isLoading, isError, refetch } = useDiscoverTeams(debounced || undefined, 30, 0)
  const teams: TeamRef[] = (data?.teams ?? []).filter((t: TeamRef) => t.id !== exclude)

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Select a team</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <MaterialCommunityIcons name="close" size={22} color={LocColors.muted} />
            </TouchableOpacity>
          </View>
          <FormField label="Search" value={search} onChangeText={setSearch} placeholder="Team name" />
          {isLoading ? (
            <ActivityIndicator color={LocColors.green} style={styles.modalLoading} />
          ) : isError ? (
            <TouchableOpacity onPress={() => refetch()} accessibilityRole="button">
              <Text style={styles.modalRetry}>Couldn’t load teams. Tap to retry.</Text>
            </TouchableOpacity>
          ) : teams.length === 0 ? (
            <Text style={styles.modalEmpty}>No teams found.</Text>
          ) : (
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {teams.map((t) => (
                <TouchableOpacity key={t.id} style={styles.teamRow} onPress={() => onPick(t)} accessibilityRole="button">
                  <Text style={styles.teamRowName}>{t.name}</Text>
                  <Text style={styles.teamRowShort}>{t.short_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  field: { gap: Spacing.xs },
  fieldLabel: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  fieldError: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: LocColors.surface,
  },
  pickText: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  pickPlaceholder: { color: LocColors.faint, fontWeight: Typography.fontWeight.normal },
  primaryBtn: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  sheet: {
    backgroundColor: LocColors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    maxHeight: '80%',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  modalLoading: { marginVertical: Spacing.lg },
  modalRetry: { fontSize: Typography.fontSize.sm, color: LocColors.green, fontWeight: Typography.fontWeight.bold },
  modalEmpty: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  modalList: { maxHeight: 320 },
  teamRow: { paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: LocColors.border },
  teamRowName: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  teamRowShort: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2 },
})
