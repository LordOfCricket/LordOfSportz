import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Switch, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { StatusBadge } from '../../../src/components/owner/StatusBadge'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import {
  useGroundStaffMember,
  usePermissionCatalog,
  useGrantStaffPermission,
  useRevokeStaffPermission,
  useDisableGroundStaff,
} from '../../../src/hooks/useOwnerStaff'
import { staffRoleLabel, permissionGroupLabel } from '../../../src/utils/ownerStatus'
import { formatDateLong } from '../../../src/utils/bookingFormat'
import { getErrorMessage } from '../../../src/utils/errors'
import { OwnerPermission } from '../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

export default function StaffDetailScreen() {
  const router = useRouter()
  const { staffId } = useLocalSearchParams<{ staffId: string }>()
  const membershipId = Number(staffId)
  const { activeGround } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId

  const { member, isLoading, isError, refetch, isRefetching } = useGroundStaffMember(publicGroundId, membershipId)
  const catalog = usePermissionCatalog()
  const grant = useGrantStaffPermission(publicGroundId ?? '')
  const revoke = useRevokeStaffPermission(publicGroundId ?? '')
  const disable = useDisableGroundStaff(publicGroundId ?? '')

  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const held = useMemo(() => new Set(member?.permissions ?? []), [member])

  const grouped = useMemo(() => {
    const map = new Map<string, OwnerPermission[]>()
    for (const p of catalog.data ?? []) {
      const g = permissionGroupLabel(p.key)
      map.set(g, [...(map.get(g) ?? []), p])
    }
    return [...map.entries()]
  }, [catalog.data])

  const onToggle = async (key: string, currentlyHas: boolean) => {
    if (pendingKey) return
    setPendingKey(key)
    setError(null)
    try {
      if (currentlyHas) await revoke.mutateAsync({ membershipId, permissionKey: key })
      else await grant.mutateAsync({ membershipId, permissionKey: key })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPendingKey(null)
    }
  }

  const onDisable = () => {
    Alert.alert('Disable this staff member?', 'Their access to this ground is removed immediately. This can’t be undone from the app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disable access',
        style: 'destructive',
        onPress: async () => {
          setError(null)
          try {
            await disable.mutateAsync(membershipId)
            router.back()
          } catch (err) {
            setError(getErrorMessage(err))
          }
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader title={member?.name ?? 'Staff'} subtitle={activeGround?.name} />

      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : isError || !member ? (
        <EmptyState
          icon="🔍"
          title="Staff member not found"
          message="They may have been disabled, or belong to a different ground. Disabled staff are not shown."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                refetch()
                catalog.refetch()
              }}
              tintColor={LocColors.green}
            />
          }
        >
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Staff information</Text>
            <Row label="Name" value={member.name} />
            {member.email ? <Row label="Email" value={member.email} /> : null}
            {member.phone ? <Row label="Phone" value={member.phone} /> : null}
            <Row label="Added" value={formatDateLong(member.createdAt)} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Role & ground scope</Text>
            <View style={styles.badgeRow}>
              <StatusBadge label={staffRoleLabel(member.role)} tone="info" />
              <StatusBadge label="Active" tone="positive" />
            </View>
            <Text style={styles.scopeText}>Access is limited to {activeGround?.name ?? 'this ground'}.</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Permissions</Text>
            {catalog.isLoading ? (
              <ActivityIndicator color={LocColors.green} style={styles.sectionLoading} />
            ) : catalog.isError ? (
              <View>
                <Text style={styles.muted}>Couldn’t load the permission catalog.</Text>
                <TouchableOpacity onPress={() => catalog.refetch()} accessibilityRole="button">
                  <Text style={styles.link}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              grouped.map(([group, perms]) => (
                <View key={group} style={styles.group}>
                  <Text style={styles.groupLabel}>{group}</Text>
                  {perms.map((p) => {
                    const has = held.has(p.key)
                    return (
                      <View key={p.key} style={styles.permRow}>
                        <View style={styles.permText}>
                          <Text style={styles.permName}>{p.key.replace(/_/g, ' ')}</Text>
                          {p.description ? <Text style={styles.permDesc}>{p.description}</Text> : null}
                        </View>
                        {pendingKey === p.key ? (
                          <ActivityIndicator color={LocColors.green} />
                        ) : (
                          <Switch
                            value={has}
                            onValueChange={() => onToggle(p.key, has)}
                            disabled={Boolean(pendingKey)}
                            trackColor={{ true: LocColors.green, false: LocColors.borderSoft }}
                            thumbColor={LocColors.surface}
                          />
                        )}
                      </View>
                    )
                  })}
                </View>
              ))
            )}
          </View>

          <TouchableOpacity
            style={[styles.dangerBtn, disable.isPending && styles.btnDisabled]}
            onPress={onDisable}
            disabled={disable.isPending}
            accessibilityRole="button"
          >
            {disable.isPending ? (
              <ActivityIndicator color={LocColors.surface} />
            ) : (
              <>
                <MaterialCommunityIcons name="account-off-outline" size={18} color={LocColors.surface} />
                <Text style={styles.dangerBtnText}>Disable staff access</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  sectionLoading: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: 3 },
  rowLabel: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  rowValue: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '600', color: LocColors.navy, textAlign: 'right' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  scopeText: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: Spacing.xs },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  link: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green, marginTop: Spacing.xs },
  group: { gap: Spacing.xs, marginTop: Spacing.sm },
  groupLabel: { fontSize: Typography.fontSize.xs, fontWeight: '800', color: LocColors.muted },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: LocColors.border,
  },
  permText: { flex: 1, gap: 2 },
  permName: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy, textTransform: 'capitalize' },
  permDesc: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: '#B91C1C',
  },
  btnDisabled: { opacity: 0.6 },
  dangerBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
