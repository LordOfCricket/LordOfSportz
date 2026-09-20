import React from 'react'
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { usePlayerFollow, useTeamFollow, useGroundFollow } from '../hooks/useFollow'
import { Colors, Spacing, Typography, BorderRadius } from '../constants/colors'

// Follow / Following toggle. Renders nothing for a logged-out visitor
// (following is authenticated-only; the public profile stays fully visible).
// State is server-authoritative via useFollow.
type Props =
  | { type: 'player'; publicPlayerId: string | null; teamId?: never; publicGroundId?: never }
  | { type: 'team'; teamId: number | null; publicPlayerId?: never; publicGroundId?: never }
  | { type: 'ground'; publicGroundId: string | null; publicPlayerId?: never; teamId?: never }

export function FollowButton(props: Props) {
  const player = usePlayerFollow(props.type === 'player' ? props.publicPlayerId ?? null : null)
  const team = useTeamFollow(props.type === 'team' ? props.teamId ?? null : null)
  const ground = useGroundFollow(props.type === 'ground' ? props.publicGroundId ?? null : null)
  const f = props.type === 'player' ? player : props.type === 'team' ? team : ground

  if (!f.available) return null

  if (f.loading || f.following === null) {
    return (
      <View style={[styles.btn, styles.btnIdle, styles.loadingBox]}>
        <ActivityIndicator size="small" color={Colors.textSecondary} />
      </View>
    )
  }

  return (
    <TouchableOpacity
      style={[styles.btn, f.following ? styles.btnFollowing : styles.btnIdle]}
      onPress={f.toggle}
      disabled={f.pending}
      accessibilityRole="button"
      accessibilityState={{ selected: !!f.following, disabled: f.pending }}
      accessibilityLabel={f.following ? 'Following — tap to unfollow' : 'Follow'}
    >
      <MaterialCommunityIcons
        name={f.following ? 'check' : 'plus'}
        size={16}
        color={f.following ? Colors.success : Colors.text}
      />
      <Text style={[styles.label, f.following ? styles.labelFollowing : styles.labelIdle]}>
        {f.following ? 'Following' : 'Follow'}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  btnIdle: { borderColor: Colors.border, backgroundColor: Colors.backgroundAlt },
  btnFollowing: { borderColor: Colors.success, backgroundColor: Colors.background },
  loadingBox: { minWidth: 96, justifyContent: 'center' },
  label: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold },
  labelIdle: { color: Colors.text },
  labelFollowing: { color: Colors.success },
})
