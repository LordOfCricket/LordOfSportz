import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { useGroundAmenities, useAmenityCatalog, useAddGroundAmenity, useRemoveGroundAmenity } from '../../../src/hooks/useGroundContent'
import { getErrorMessage } from '../../../src/utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

export default function GroundAmenitiesScreen() {
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const assigned = useGroundAmenities(publicGroundId)
  const catalog = useAmenityCatalog(Boolean(publicGroundId))
  const add = useAddGroundAmenity(publicGroundId ?? '')
  const remove = useRemoveGroundAmenity(publicGroundId ?? '')

  const [error, setError] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const assignedList = assigned.data ?? []
  const assignedKeys = new Set(assignedList.map((a) => a.key))
  const available = (catalog.data ?? []).filter((a) => a.key && !assignedKeys.has(a.key))
  const working = add.isPending || remove.isPending

  const onAdd = async (key: string) => {
    if (working) return
    setError(null)
    setPendingKey(key)
    try {
      await add.mutateAsync(key)
    } catch (err) {
      setError(getErrorMessage(err))
      assigned.refetch()
    } finally {
      setPendingKey(null)
    }
  }

  const onRemove = (key: string, name: string) => {
    Alert.alert('Remove amenity?', `Remove “${name}” from this ground?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setError(null)
          setPendingKey(key)
          try {
            await remove.mutateAsync(key)
          } catch (err) {
            setError(getErrorMessage(err))
            assigned.refetch()
          } finally {
            setPendingKey(null)
          }
        },
      },
    ])
  }

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Amenities" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to manage its amenities." />
      </View>
    )
  }

  const loading = assigned.isLoading || catalog.isLoading || groundsLoading
  const isError = assigned.isError || catalog.isError

  return (
    <View style={styles.container}>
      <OwnerSubHeader title="Amenities" subtitle={activeGround?.name} />

      {loading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : isError ? (
        <View style={styles.centerPad}>
          <Text style={styles.muted}>Couldn’t load amenities.</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              assigned.refetch()
              catalog.refetch()
            }}
            accessibilityRole="button"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={assigned.isRefetching}
              onRefresh={() => {
                assigned.refetch()
                catalog.refetch()
              }}
              tintColor={LocColors.green}
            />
          }
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionLabel}>On this ground</Text>
          {assignedList.length === 0 ? (
            <Text style={styles.empty}>No amenities added yet.</Text>
          ) : (
            <View style={styles.chipWrap}>
              {assignedList.map((a) => (
                <TouchableOpacity
                  key={a.key}
                  style={[styles.chip, styles.chipAssigned]}
                  onPress={() => onRemove(a.key as string, a.name)}
                  disabled={working}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${a.name}`}
                >
                  <Text style={styles.chipAssignedText}>{a.name}</Text>
                  {pendingKey === a.key ? (
                    <ActivityIndicator size="small" color={LocColors.greenStrong} />
                  ) : (
                    <MaterialCommunityIcons name="close" size={14} color={LocColors.greenStrong} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[styles.sectionLabel, styles.sectionGap]}>Available to add</Text>
          {available.length === 0 ? (
            <Text style={styles.empty}>All catalog amenities are already added.</Text>
          ) : (
            <View style={styles.chipWrap}>
              {available.map((a) => (
                <TouchableOpacity
                  key={a.key}
                  style={styles.chip}
                  onPress={() => onAdd(a.key as string)}
                  disabled={working}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${a.name}`}
                >
                  {pendingKey === a.key ? (
                    <ActivityIndicator size="small" color={LocColors.green} />
                  ) : (
                    <MaterialCommunityIcons name="plus" size={14} color={LocColors.green} />
                  )}
                  <Text style={styles.chipText}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  sectionGap: { marginTop: Spacing.lg },
  empty: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    backgroundColor: LocColors.surface,
  },
  chipText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.navy },
  chipAssigned: { backgroundColor: LocColors.greenPale, borderColor: LocColors.greenPale },
  chipAssignedText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.greenStrong },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
