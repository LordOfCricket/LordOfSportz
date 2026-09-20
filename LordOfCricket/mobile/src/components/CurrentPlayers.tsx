import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Colors, Spacing, Typography } from '../constants/colors'

interface BattingPlayer {
  player: { publicPlayerId: string | null; name: string }
  runs: number
  balls: number
  fours: number
  sixes: number
  strikeRate: number | null
}

interface BowlingPlayer {
  player: { publicPlayerId: string | null; name: string }
  oversLabel: string
  runs: number
  wickets: number
  economy: number | null
}

interface CurrentPlayersProps {
  striker: BattingPlayer | null | undefined
  nonStriker: BattingPlayer | null | undefined
  bowler: BowlingPlayer | null | undefined
}

// The live-scoring domain already carries publicPlayerId alongside name
// (BattingPlayer/BowlingPlayer above) — it just wasn't rendered as a link.
// Only tappable when a real id is present (it's typed nullable — never
// invented); otherwise renders as the same plain text as before.
function PlayerNameLink({ publicPlayerId, name }: { publicPlayerId: string | null; name: string }) {
  const router = useRouter()
  if (!publicPlayerId) {
    return <Text style={styles.playerName}>{name}</Text>
  }
  return (
    <TouchableOpacity
      style={styles.playerNameRow}
      onPress={() => router.push(`/(tabs)/players/${publicPlayerId}` as any)}
      accessibilityRole="button"
      accessibilityLabel={`View ${name}'s player profile`}
    >
      <Text style={styles.playerName}>{name}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
    </TouchableOpacity>
  )
}

export function CurrentPlayers({ striker, nonStriker, bowler }: CurrentPlayersProps) {
  if (!striker && !nonStriker && !bowler) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Match Not Live</Text>
        <Text style={styles.emptyText}>Player information will appear when the match starts</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {striker && (
        <View style={styles.section}>
          <Text style={styles.roleLabel}>Striker</Text>
          <View style={styles.playerCard}>
            <PlayerNameLink publicPlayerId={striker.player.publicPlayerId} name={striker.player.name} />
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{striker.runs}</Text>
                <Text style={styles.statLabel}>Runs</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{striker.balls}</Text>
                <Text style={styles.statLabel}>Balls</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{striker.fours}</Text>
                <Text style={styles.statLabel}>4s</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{striker.sixes}</Text>
                <Text style={styles.statLabel}>6s</Text>
              </View>
              {striker.strikeRate !== null && (
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{striker.strikeRate.toFixed(1)}</Text>
                  <Text style={styles.statLabel}>SR</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {nonStriker && (
        <View style={styles.section}>
          <Text style={styles.roleLabel}>Non-Striker</Text>
          <View style={styles.playerCard}>
            <PlayerNameLink publicPlayerId={nonStriker.player.publicPlayerId} name={nonStriker.player.name} />
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{nonStriker.runs}</Text>
                <Text style={styles.statLabel}>Runs</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{nonStriker.balls}</Text>
                <Text style={styles.statLabel}>Balls</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{nonStriker.fours}</Text>
                <Text style={styles.statLabel}>4s</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{nonStriker.sixes}</Text>
                <Text style={styles.statLabel}>6s</Text>
              </View>
              {nonStriker.strikeRate !== null && (
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{nonStriker.strikeRate.toFixed(1)}</Text>
                  <Text style={styles.statLabel}>SR</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {bowler && (
        <View style={styles.section}>
          <Text style={styles.roleLabel}>Bowler</Text>
          <View style={styles.playerCard}>
            <PlayerNameLink publicPlayerId={bowler.player.publicPlayerId} name={bowler.player.name} />
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{bowler.oversLabel}</Text>
                <Text style={styles.statLabel}>Overs</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{bowler.runs}</Text>
                <Text style={styles.statLabel}>Runs</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{bowler.wickets}</Text>
                <Text style={styles.statLabel}>Wickets</Text>
              </View>
              {bowler.economy !== null && (
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{bowler.economy.toFixed(2)}</Text>
                  <Text style={styles.statLabel}>Economy</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  section: {
    marginBottom: Spacing.md,
  },
  roleLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  playerCard: {
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
  },
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    minHeight: 36,
  },
  playerName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  stat: {
    alignItems: 'center',
    minWidth: '22%',
  },
  statValue: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  statLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
  },
  title: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
})
