import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../../../../src/hooks/useAuth'
import { useMyPlayer } from '../../../../../src/hooks/usePlayer'
import { useMatchProposalDetail, useAcceptMatchProposal, useCancelMatchProposal } from '../../../../../src/hooks/useMatchProposals'
import { Colors, Spacing, Typography } from '../../../../../src/constants/colors'
import { LoadingScreen } from '../../../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../../../src/components/ErrorScreen'

export default function ProposalDetailScreen() {
  const router = useRouter()
  const { id: groundId, proposalId } = useLocalSearchParams<{ id: string; proposalId: string }>()
  const { user } = useAuth()
  const playerQuery = useMyPlayer(user?.role === 'player')

  const { data: detailData, isLoading, isError, refetch } = useMatchProposalDetail(groundId || '', proposalId || '')
  const acceptMutation = useAcceptMatchProposal()
  const cancelMutation = useCancelMatchProposal()

  const proposal = detailData?.proposal
  // Snapshot "now" once so render stays pure; a proposal won't expire
  // within a single view of this screen, and the accept action is
  // re-validated server-side regardless.
  const [now] = useState(() => Date.now())

  const handleAccept = () => {
    const player = playerQuery.data
    if (!groundId || !proposalId || !user || !player?.team_id) {
      Alert.alert('Error', 'You must be a member of a team to accept this proposal.')
      return
    }

    const teamId = player.team_id

    Alert.alert('Accept Proposal', 'Do you want to accept this proposal?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Accept',
        onPress: () => {
          acceptMutation.mutate(
            {
              publicGroundId: groundId,
              publicProposalId: proposalId,
              data: {
                teamId: teamId,
                participantPlayerIds: [],
              },
            },
            {
              onSuccess: () => {
                Alert.alert('Success', 'Proposal accepted!', [
                  { text: 'OK', onPress: () => router.back() },
                ])
              },
              onError: (error: any) => {
                Alert.alert('Error', error?.response?.data?.message || 'Failed to accept proposal')
              },
            }
          )
        },
      },
    ])
  }

  const handleCancel = () => {
    if (!groundId || !proposalId) return

    Alert.alert('Cancel Proposal', 'Do you want to cancel this proposal?', [
      { text: 'No', onPress: () => {} },
      {
        text: 'Yes, Cancel',
        onPress: () => {
          cancelMutation.mutate(
            {
              publicGroundId: groundId,
              publicProposalId: proposalId,
              reason: 'Cancelled by proposer',
            },
            {
              onSuccess: () => {
                Alert.alert('Success', 'Proposal cancelled', [
                  { text: 'OK', onPress: () => router.back() },
                ])
              },
              onError: (error: any) => {
                Alert.alert('Error', error?.response?.data?.message || 'Failed to cancel proposal')
              },
            }
          )
        },
      },
    ])
  }

  if (!groundId || !proposalId) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorScreen
          title="Error"
          message="Required parameters missing"
          onRetry={() => router.back()}
          retryLabel="Go Back"
        />
      </SafeAreaView>
    )
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isError || !proposal) {
    return (
      <ErrorScreen
        title="Failed to Load"
        message="Could not load proposal details."
        onRetry={() => refetch()}
      />
    )
  }

  const isExpired = new Date(proposal.proposalExpiresAt).getTime() < now
  const canAccept = proposal.status === 'OPEN' && !isExpired
  const canCancel = proposal.status === 'OPEN'

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.proposalId}>{proposal.publicProposalId}</Text>
            <Text
              style={[
                styles.status,
                proposal.status === 'OPEN' && styles.statusOpen,
                proposal.status === 'CONFIRMED' && styles.statusConfirmed,
              ]}
            >
              {proposal.status}
            </Text>
          </View>

          {proposal.startTime && (
            <View style={styles.infoSection}>
              <Text style={styles.label}>Scheduled Time</Text>
              <Text style={styles.value}>
                {new Date(proposal.startTime).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          )}

          {proposal.matchFormat && (
            <View style={styles.infoSection}>
              <Text style={styles.label}>Match Format</Text>
              <Text style={styles.value}>{proposal.matchFormat}</Text>
            </View>
          )}

          {proposal.purpose && (
            <View style={styles.infoSection}>
              <Text style={styles.label}>Purpose</Text>
              <Text style={styles.value}>{proposal.purpose}</Text>
            </View>
          )}

          <View style={styles.infoSection}>
            <Text style={styles.label}>Expires At</Text>
            <Text style={styles.value}>
              {new Date(proposal.proposalExpiresAt).toLocaleString('en-US')}
            </Text>
          </View>

          {isExpired && (
            <View style={styles.expiredWarning}>
              <Text style={styles.expiredText}>This proposal has expired</Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        {user && canAccept && (
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={handleAccept}
            disabled={acceptMutation.isPending}
          >
            {acceptMutation.isPending ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.acceptButtonText}>Accept Proposal</Text>
            )}
          </TouchableOpacity>
        )}

        {user && canCancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <Text style={styles.cancelButtonText}>Cancel Proposal</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
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
  },
  card: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.lg,
    margin: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  proposalId: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  status: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 6,
    backgroundColor: Colors.border,
    color: Colors.text,
  },
  statusOpen: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
  },
  statusConfirmed: {
    backgroundColor: '#DBEAFE',
    color: '#0C4A6E',
  },
  infoSection: {
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  label: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  value: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  expiredWarning: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 6,
    marginTop: Spacing.lg,
  },
  expiredText: {
    color: '#991B1B',
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
  },
  acceptButton: {
    backgroundColor: Colors.primary,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
    fontSize: Typography.fontSize.base,
  },
  cancelButton: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.bold,
    fontSize: Typography.fontSize.base,
  },
})
