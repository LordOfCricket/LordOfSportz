import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useOpenProposalsForGround } from '../../../../src/hooks/useMatchProposals'
import { Colors, Spacing, Typography } from '../../../../src/constants/colors'
import { LoadingScreen } from '../../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../../src/components/ErrorScreen'
import { EmptyState } from '../../../../src/components/EmptyState'
import { MatchProposal } from '../../../../src/types'

export default function ProposalsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, isError, refetch } = useOpenProposalsForGround(id || '')

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const handleProposalPress = (publicProposalId: string) => {
    if (!id) return
    router.push(`/(tabs)/grounds/${id}/proposals/${publicProposalId}`)
  }

  if (!id) {
    return (
      <View style={styles.container}>
        <ErrorScreen
          title="Error"
          message="Ground ID is required"
          onRetry={() => router.back()}
          retryLabel="Go Back"
        />
      </View>
    )
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isError) {
    return (
      <ErrorScreen
        title="Failed to Load"
        message="Could not load proposals."
        onRetry={() => refetch()}
      />
    )
  }

  const proposals = data?.proposals || []
  const openProposals = proposals.filter((p) => p.status === 'OPEN')

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Open Proposals</Text>
      </View>

      {openProposals.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListEmptyComponent={
            <EmptyState
              title="No proposals"
              message="No open match proposals at this ground"
            />
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        />
      ) : (
        <FlatList
          data={openProposals}
          keyExtractor={(item) => item.publicProposalId}
          renderItem={({ item }) => (
            <ProposalCard
              proposal={item}
              onPress={() => handleProposalPress(item.publicProposalId)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        />
      )}
    </View>
  )
}

function ProposalCard({
  proposal,
  onPress,
}: {
  proposal: MatchProposal
  onPress: () => void
}) {
  const expiresAt = new Date(proposal.proposalExpiresAt)
  const now = new Date()
  const hoursRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Proposal ${proposal.publicProposalId}`}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.proposalId}>{proposal.publicProposalId}</Text>
        <Text
          style={[
            styles.status,
            proposal.status === 'OPEN' && styles.statusOpen,
          ]}
        >
          {proposal.status}
        </Text>
      </View>

      {proposal.startTime && (
        <Text style={styles.time}>
          🕐 {new Date(proposal.startTime).toLocaleTimeString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      )}

      {proposal.matchFormat && (
        <Text style={styles.format}>Format: {proposal.matchFormat}</Text>
      )}

      <Text style={styles.expiresIn}>
        Expires in {hoursRemaining}h
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.base,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  card: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  proposalId: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  status: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Colors.border,
    color: Colors.text,
  },
  statusOpen: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
  },
  time: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  format: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  expiresIn: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
})
