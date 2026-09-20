import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, Spacing, Typography } from '../constants/colors'
import { Match } from '../types'

interface MatchCardProps {
  match: Match
}

export function MatchCard({ match }: MatchCardProps) {
  const router = useRouter()

  const handlePress = () => {
    router.push(`/(tabs)/matches/${match.id}`)
  }

  const getStatusColor = () => {
    switch (match.status) {
      case 'live':
        return Colors.statusOngoing
      case 'upcoming':
        return Colors.statusUpcoming
      case 'completed':
        return Colors.statusCompleted
      case 'finalized':
        return Colors.success
      case 'cancelled':
        return Colors.statusCancelled
      default:
        return Colors.textTertiary
    }
  }

  const getStatusLabel = () => {
    if (match.status === 'completed') return 'Awaiting Finalization'
    if (match.status === 'finalized') return 'Official Result'
    return match.status.charAt(0).toUpperCase() + match.status.slice(1)
  }

  const matchDate = new Date(match.matchDate)
  const dateStr = matchDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Innings are batting-team-scoped, not innings-number-scoped — a team's
  // score card is whichever innings entry (1st or 2nd) it batted in.
  const inningsFor = (teamId: number) => match.innings.find((i) => i.battingTeamId === teamId) || null
  const teamAInnings = inningsFor(match.teamA.id)
  const teamBInnings = inningsFor(match.teamB.id)

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress}>
      <View style={styles.header}>
        <Text style={styles.dateText}>{dateStr}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Text style={styles.statusText}>{getStatusLabel()}</Text>
        </View>
      </View>

      <View style={styles.matchupContainer}>
        <View style={styles.team}>
          <Text style={styles.teamName} numberOfLines={1}>
            {match.teamA.name}
          </Text>
          {teamAInnings && (
            <Text style={styles.score}>
              {teamAInnings.runs}/{teamAInnings.wickets}
            </Text>
          )}
        </View>

        <Text style={styles.vs}>vs</Text>

        <View style={styles.team}>
          <Text style={styles.teamName} numberOfLines={1}>
            {match.teamB.name}
          </Text>
          {teamBInnings && (
            <Text style={styles.score}>
              {teamBInnings.runs}/{teamBInnings.wickets}
            </Text>
          )}
        </View>
      </View>

      {match.venue && <Text style={styles.venueText}>{match.venue}</Text>}
      {match.result && <Text style={styles.resultText}>{match.result.text}</Text>}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  dateText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
  matchupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  team: {
    flex: 1,
    alignItems: 'center',
  },
  teamName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  score: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  vs: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textTertiary,
    marginHorizontal: Spacing.md,
    fontWeight: Typography.fontWeight.medium,
  },
  venueText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  resultText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
    textAlign: 'center',
  },
})
