import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  TextInput,
  GestureResponderEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useAuthStore } from '../../../../src/store/authStore'
import { useMobileScorer } from '../../../../src/hooks/useMobileScorer'
import { useMatchUmpireSlots } from '../../../../src/hooks/useUmpireDiscovery'
import * as scoringApi from '../../../../src/services/scoringApi'
import { resolveShot, WHEEL, type ResolvedShot } from '../../../../src/lib/wagonWheelGeometry'
import { getErrorMessage } from '../../../../src/utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

const C = LocColors
const DISMISSALS = ['bowled', 'caught', 'lbw', 'stumped', 'hit-wicket', 'run-out'] as const

export default function UmpireScoreScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const userId = useAuthStore((s) => s.user?.id)
  const { matchId: matchIdParam } = useLocalSearchParams<{ matchId: string }>()
  const matchId = Number(matchIdParam)

  const slotsQuery = useMatchUmpireSlots(Number.isFinite(matchId) ? matchId : null)
  const mySlot = (slotsQuery.data ?? []).find((s) => s.umpire_user_id === userId)
  const assigned = mySlot?.status === 'ASSIGNED' || mySlot?.status === 'COMPLETED'

  // Which innings is the workspace pinned to: the live one, else the latest.
  const [inningsList, setInningsList] = useState<scoringApi.InningsRow[]>([])
  const [inningsLoaded, setInningsLoaded] = useState(false)
  const [setupBusy, setSetupBusy] = useState(false)
  const [setupError, setSetupError] = useState('')

  React.useEffect(() => {
    let cancelled = false
    if (!Number.isFinite(matchId)) return
    scoringApi
      .listInnings(matchId)
      .then((rows) => {
        if (!cancelled) {
          setInningsList(rows)
          setInningsLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) setInningsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [matchId, setupBusy])

  const liveInnings = inningsList.find((i) => i.status === 'live')
  const latestInnings = inningsList.length ? inningsList[inningsList.length - 1] : undefined
  const pinnedInningsId = (liveInnings ?? latestInnings)?.id ?? null

  const scorer = useMobileScorer(matchId, pinnedInningsId)
  const {
    match,
    state,
    timeline,
    wagonWheelShots,
    matchPlayers,
    playersById,
    loading,
    loadError,
    actionError,
    conflictNotice,
    pending,
    connected,
    refresh,
    recordDelivery,
    selectNextBatsman,
    undoDelivery,
    previewCorrection,
    clearActionError,
  } = scorer

  const status = match?.match?.status
  const toss = match?.toss ?? null
  const teamA = match?.teams?.teamA
  const teamB = match?.teams?.teamB

  const [bowlerId, setBowlerId] = useState<number | null>(null)
  const [pendingShot, setPendingShot] = useState<ResolvedShot | null>(null)
  const [showWheel, setShowWheel] = useState(false)
  const [showWicket, setShowWicket] = useState(false)
  const [numberPrompt, setNumberPrompt] = useState<{ title: string; initial: number; onOk: (n: number) => void } | null>(null)
  const [picker, setPicker] = useState<{ title: string; teamId: number; onPick: (mpId: number) => void } | null>(null)

  // Resolve the bowler for the current over from authoritative state (mirrors
  // useRealScorer): mid-over there is exactly one possible bowler; at the top
  // of an over the scorer must pick.
  const sBowler = state?.bowler ?? null
  const sBallInOver = state?.score.ballInOver
  React.useEffect(() => {
    if (sBallInOver === undefined) return
    if (sBallInOver > 0 && sBowler != null) setBowlerId(sBowler)
    if (sBallInOver === 0) setBowlerId(null)
  }, [sBowler, sBallInOver])

  const xiFor = (teamId: number | undefined) =>
    teamId == null ? [] : matchPlayers.filter((mp) => mp.team_id === teamId && mp.is_playing_xi)

  const battingTeamId = state?.innings.battingTeamId
  const bowlingTeamId = state?.innings.bowlingTeamId

  const lastDelivery = useMemo(
    () => [...timeline.timeline].reverse().find((e) => e.kind === 'delivery' && !e.voided),
    [timeline],
  )

  const inningsFinished =
    !!state && (state.isAllOut || state.isOversComplete || state.innings.status === 'completed')
  const matchOver = status === 'completed' || status === 'finalized'
  const needsBatsman = !!state?.pendingBatsmanSelection
  const needsBowler = !!state && !inningsFinished && !needsBatsman && state.score.ballInOver === 0 && bowlerId == null

  const canScore = assigned && status === 'live' && !!state && !inningsFinished && !matchOver

  // ---- delivery helpers ---------------------------------------------------
  const send = (input: scoringApi.DeliveryInput) => {
    if (!canScore || pending) return
    if (bowlerId == null) {
      Alert.alert('Select a bowler', 'Choose the bowler for this over first.')
      return
    }
    const withShot = pendingShot
      ? { ...input, shot: { normalizedX: pendingShot.normalizedX, normalizedY: pendingShot.normalizedY, angleDegrees: pendingShot.angleDegrees, regionId: pendingShot.regionId } }
      : input
    setPendingShot(null)
    recordDelivery(withShot, bowlerId)
  }

  const onRuns = (n: number) => send({ batRuns: n })
  const onWide = () =>
    setNumberPrompt({ title: 'Wide — extra runs (byes ran)', initial: 0, onOk: (n) => send({ illegal: { type: 'wide', runs: 1 + n } }) })
  const onNoBall = () =>
    setNumberPrompt({ title: 'No-ball — runs off the bat', initial: 0, onOk: (n) => send({ illegal: { type: 'no-ball', runs: 1 }, batRuns: n }) })
  const onBye = () =>
    setNumberPrompt({ title: 'Byes', initial: 1, onOk: (n) => send({ extra: { type: 'bye', runs: n } }) })
  const onLegBye = () =>
    setNumberPrompt({ title: 'Leg byes', initial: 1, onOk: (n) => send({ extra: { type: 'leg-bye', runs: n } }) })

  const confirmUndo = () => {
    if (!lastDelivery?.id) return
    previewCorrection(lastDelivery.id, { voided: true })
      .then((p) => {
        Alert.alert('Undo last delivery', p?.message || 'This voids the last legal delivery and replays the innings.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Undo', style: 'destructive', onPress: () => undoDelivery(lastDelivery.id) },
        ])
      })
      .catch(() =>
        Alert.alert('Undo last delivery', 'Void the last legal delivery?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Undo', style: 'destructive', onPress: () => undoDelivery(lastDelivery.id) },
        ]),
      )
  }

  // ---- setup actions ----------------------------------------------------
  const runSetup = async (fn: () => Promise<void>) => {
    if (setupBusy) return
    setSetupBusy(true)
    setSetupError('')
    try {
      await fn()
      await refresh()
    } catch (err) {
      setSetupError(getErrorMessage(err))
    } finally {
      setSetupBusy(false)
    }
  }

  const doStart = () =>
    runSetup(async () => {
      try {
        await scoringApi.startMatch(matchId)
      } catch (err: any) {
        if (err?.response?.data?.understaffed) {
          await new Promise<void>((res, rej) =>
            Alert.alert('Understaffed', err.response.data.message || 'Not all umpire slots are filled. Start anyway?', [
              { text: 'Cancel', style: 'cancel', onPress: () => rej(new Error('Cancelled')) },
              { text: 'Start', onPress: () => scoringApi.startMatch(matchId, { confirmUnderstaffed: true }).then(res).catch(rej) },
            ]),
          )
          return
        }
        throw err
      }
    })

  const startInnings = (inningsNumber: number, batId: number, bowlId: number) =>
    runSetup(async () => {
      const inn = await scoringApi.createInnings(matchId, { inningsNumber, battingTeamId: batId, bowlingTeamId: bowlId })
      setInningsList((prev) => [...prev.filter((i) => i.id !== inn.id), inn])
    })

  const doFinalize = () =>
    Alert.alert('Finalize match', 'Lock the result and end officiating. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finalize', style: 'destructive', onPress: () => runSetup(() => scoringApi.finalizeMatch(matchId).then(() => router.back())) },
    ])

  // ---- render ---------------------------------------------------------
  const header = (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
        <MaterialCommunityIcons name="chevron-left" size={26} color={C.navy} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Scoring</Text>
      <View style={styles.connRow}>
        <View style={[styles.dot, { backgroundColor: connected ? '#16A34A' : C.faint }]} />
        <Text style={styles.connText}>{connected ? 'Live' : 'Offline'}</Text>
      </View>
    </View>
  )

  if (loading || slotsQuery.isLoading || !inningsLoaded) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centre}>
          <ActivityIndicator color={C.green} />
        </View>
      </View>
    )
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centre}>
          <Text style={styles.stateTitle}>{loadError}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => refresh()} accessibilityRole="button">
            <Text style={styles.btnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (!assigned) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centre}>
          <MaterialCommunityIcons name="lock-outline" size={32} color={C.faint} />
          <Text style={styles.stateTitle}>You are not assigned to umpire this match</Text>
          <Text style={styles.stateSub}>Scoring is only available to the assigned umpire.</Text>
        </View>
      </View>
    )
  }

  const teamName = (id?: number | null) => (id === teamA?.id ? teamA?.name : id === teamB?.id ? teamB?.name : '')

  return (
    <View style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing['3xl'] }]}>
        {/* Match line */}
        <View style={styles.card}>
          <Text style={styles.teams}>
            {teamA?.name} <Text style={styles.vs}>vs</Text> {teamB?.name}
          </Text>
          <Text style={styles.metaLine}>
            {(match?.ground?.name || match?.match?.venue || 'Venue TBD') as string} ·{' '}
            {String(status ?? '').replace(/^\w/, (c) => c.toUpperCase())}
          </Text>
          {toss && <Text style={styles.metaLine}>{toss.text}</Text>}
        </View>

        {conflictNotice ? <Text style={styles.notice}>{conflictNotice}</Text> : null}
        {actionError ? (
          <TouchableOpacity onPress={clearActionError}>
            <Text style={styles.err}>{actionError} (tap to dismiss)</Text>
          </TouchableOpacity>
        ) : null}
        {setupError ? <Text style={styles.err}>{setupError}</Text> : null}

        {/* Cancelled */}
        {status === 'cancelled' && (
          <View style={styles.card}>
            <Text style={styles.stateTitle}>Match cancelled</Text>
            <Text style={styles.stateSub}>No scoring actions are available.</Text>
          </View>
        )}

        {/* Completed / finalized */}
        {matchOver && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Result</Text>
            <Text style={styles.result}>{match?.result?.text || 'Match complete.'}</Text>
            {match?.innings?.map((inn) => (
              <Text key={inn.inningsId} style={styles.metaLine}>
                {teamName(inn.battingTeamId)} {inn.score.runs}/{inn.score.wickets} ({inn.score.oversLabel})
              </Text>
            ))}
            {status === 'completed' && (
              <TouchableOpacity style={[styles.primaryBtn, setupBusy && styles.disabled]} onPress={doFinalize} disabled={setupBusy}>
                <Text style={styles.primaryBtnText}>{setupBusy ? 'Working…' : 'Finalize match'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Setup: upcoming -> start */}
        {status === 'upcoming' && !matchOver && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Match setup</Text>
            {!toss ? (
              <Text style={styles.stateSub}>
                Record the toss on the match setup screen (web) before starting. Playing XI must also be set.
              </Text>
            ) : (
              <Text style={styles.metaLine}>{toss.text}</Text>
            )}
            <TouchableOpacity
              style={[styles.primaryBtn, (!toss || setupBusy) && styles.disabled]}
              onPress={doStart}
              disabled={!toss || setupBusy}
            >
              <Text style={styles.primaryBtnText}>{setupBusy ? 'Starting…' : 'Start match'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Live, no live innings -> start an innings */}
        {status === 'live' && !state && (
          <InningsSetup
            inningsList={inningsList}
            toss={toss}
            teamA={teamA}
            teamB={teamB}
            busy={setupBusy}
            onStart={startInnings}
          />
        )}
        {status === 'live' && state && state.innings.status !== 'live' && inningsFinished && state.innings.inningsNumber === 1 && (
          <InningsSetup
            inningsList={inningsList}
            toss={toss}
            teamA={teamA}
            teamB={teamB}
            busy={setupBusy}
            forceSecond
            onStart={startInnings}
          />
        )}

        {/* Live scoring */}
        {state && (status === 'live' || matchOver) && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>
                {teamName(battingTeamId)} — Innings {state.innings.inningsNumber}
              </Text>
              <Text style={styles.bigScore}>
                {state.score.runs}/{state.score.wickets}
                <Text style={styles.overs}>
                  {'  '}
                  ({state.score.overNumber}.{state.score.ballInOver})
                </Text>
              </Text>
              {state.isFreeHitNext && <Text style={styles.freehit}>FREE HIT next ball</Text>}
              {inningsFinished && <Text style={styles.notice}>Innings complete ({state.isAllOut ? 'all out' : 'overs done'})</Text>}
            </View>

            {/* Batters */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Batters</Text>
              <BatterRow label="Striker" mpId={state.striker} playersById={playersById} bat={state.striker != null ? state.batsmen[String(state.striker)] : undefined} />
              <BatterRow label="Non-striker" mpId={state.nonStriker} playersById={playersById} bat={state.nonStriker != null ? state.batsmen[String(state.nonStriker)] : undefined} />
              {needsBatsman && (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() =>
                    setPicker({
                      title: 'New batter',
                      teamId: battingTeamId as number,
                      onPick: (mpId) => {
                        setPicker(null)
                        selectNextBatsman(state.pendingBatsmanSelection as 'strikerEnd' | 'nonStrikerEnd', mpId)
                      },
                    })
                  }
                >
                  <Text style={styles.primaryBtnText}>Select new batter</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Bowler */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Bowler</Text>
              <View style={styles.bowlerRow}>
                <Text style={styles.bowlerName}>
                  {bowlerId != null ? playersById.get(bowlerId)?.name ?? 'Unknown' : 'Not selected'}
                  {bowlerId != null && state.bowlers[String(bowlerId)]
                    ? `  ${fmtOvers(state.bowlers[String(bowlerId)].legalBalls)}-${state.bowlers[String(bowlerId)].runs}-${state.bowlers[String(bowlerId)].wickets ?? 0}`
                    : ''}
                </Text>
                {canScore && (
                  <TouchableOpacity
                    onPress={() =>
                      setPicker({
                        title: 'Select bowler',
                        teamId: bowlingTeamId as number,
                        onPick: (mpId) => {
                          setPicker(null)
                          setBowlerId(mpId)
                        },
                      })
                    }
                  >
                    <Text style={styles.link}>{state.score.ballInOver === 0 ? 'Select' : 'Change'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {needsBowler && <Text style={styles.stateSub}>Select the bowler for this over to enable scoring.</Text>}
            </View>

            {/* Controls */}
            {canScore && !needsBatsman && (
              <View style={styles.card}>
                <View style={styles.rowWrap}>
                  {[0, 1, 2, 3, 4, 6].map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.runBtn, (n === 4 || n === 6) && styles.runBtnBoundary, (pending || needsBowler) && styles.disabled]}
                      disabled={pending || needsBowler}
                      onPress={() => onRuns(n)}
                    >
                      <Text style={[styles.runBtnText, (n === 4 || n === 6) && styles.runBtnBoundaryText]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.rowWrap}>
                  {[
                    ['Wide', onWide],
                    ['No-ball', onNoBall],
                    ['Bye', onBye],
                    ['Leg-bye', onLegBye],
                  ].map(([label, fn]) => (
                    <TouchableOpacity
                      key={label as string}
                      style={[styles.extraBtn, (pending || needsBowler) && styles.disabled]}
                      disabled={pending || needsBowler}
                      onPress={fn as () => void}
                    >
                      <Text style={styles.extraBtnText}>{label as string}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.rowWrap}>
                  <TouchableOpacity
                    style={[styles.wicketBtn, (pending || needsBowler) && styles.disabled]}
                    disabled={pending || needsBowler}
                    onPress={() => setShowWicket(true)}
                  >
                    <MaterialCommunityIcons name="alert-octagon-outline" size={16} color="#fff" />
                    <Text style={styles.wicketBtnText}>Wicket</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.ghostBtn, pendingShot && styles.ghostBtnActive]} onPress={() => setShowWheel(true)}>
                    <MaterialCommunityIcons name="target" size={16} color={pendingShot ? C.green : C.muted} />
                    <Text style={[styles.ghostBtnText, pendingShot && { color: C.green }]}>
                      {pendingShot ? `Shot: ${pendingShot.label}` : 'Wagon wheel'}
                    </Text>
                  </TouchableOpacity>
                  {pendingShot && (
                    <TouchableOpacity style={styles.ghostBtn} onPress={() => setPendingShot(null)}>
                      <Text style={styles.ghostBtnText}>Clear shot</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {pending && <ActivityIndicator color={C.green} style={{ marginTop: Spacing.sm }} />}
              </View>
            )}

            {/* Recent + undo */}
            <View style={styles.card}>
              <View style={styles.bowlerRow}>
                <Text style={styles.sectionLabel}>Recent deliveries</Text>
                {canScore && lastDelivery != null && (
                  <TouchableOpacity onPress={confirmUndo} disabled={pending}>
                    <Text style={[styles.link, { color: '#B91C1C' }]}>Undo last</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.rowWrap}>
                {timeline.timeline
                    .filter((e) => e.kind === 'delivery')
                  .slice(-12)
                  .map((e, i) => (
                    <View key={`${e.id}-${i}`} style={[styles.ball, e.voided && styles.ballVoid]}>
                      <Text style={styles.ballText}>{e.voided ? '·' : ballLabel(e)}</Text>
                    </View>
                  ))}
                {timeline.timeline.filter((e) => e.kind === 'delivery').length === 0 && (
                  <Text style={styles.stateSub}>No deliveries yet.</Text>
                )}
              </View>
              {wagonWheelShots.length > 0 && (
                <Text style={styles.stateSub}>{wagonWheelShots.length} wagon-wheel shot(s) recorded this innings.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* number prompt — mounted only while active so state inits from props */}
      {numberPrompt && <NumberPromptModal prompt={numberPrompt} onClose={() => setNumberPrompt(null)} />}
      {/* player picker */}
      {picker && (
        <PlayerPickerModal
          picker={picker}
          players={matchPlayers.filter((mp) => mp.team_id === picker.teamId && mp.is_playing_xi)}
          onClose={() => setPicker(null)}
        />
      )}
      {/* wicket sheet */}
      {showWicket && (
        <WicketModal
          striker={state?.striker ?? null}
          nonStriker={state?.nonStriker ?? null}
          playersById={playersById}
          fielders={xiFor(bowlingTeamId)}
          onClose={() => setShowWicket(false)}
          onConfirm={(w) => {
            setShowWicket(false)
            send({ wicket: w })
          }}
        />
      )}
      {/* wagon wheel */}
      {showWheel && (
        <WagonWheelModal
          current={pendingShot}
          onClose={() => setShowWheel(false)}
          onPick={(shot) => {
            setPendingShot(shot)
            setShowWheel(false)
          }}
        />
      )}
    </View>
  )
}

// ------------------------------------------------------------------ helpers

function fmtOvers(legalBalls: number) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`
}
function ballLabel(e: scoringApi.TimelineEntry) {
  if (e.wicket) return 'W'
  const r = e.totalRuns ?? 0
  return String(r)
}

function BatterRow({
  label,
  mpId,
  playersById,
  bat,
}: {
  label: string
  mpId: number | null
  playersById: Map<number, scoringApi.MatchPlayerRow>
  bat?: scoringApi.InningsStateBatsman
}) {
  return (
    <View style={styles.batRow}>
      <Text style={styles.batLabel}>{label}</Text>
      <Text style={styles.batName}>{mpId != null ? playersById.get(mpId)?.name ?? 'Unknown' : '—'}</Text>
      <Text style={styles.batStat}>{bat ? `${bat.runs} (${bat.balls})` : ''}</Text>
    </View>
  )
}

function InningsSetup({
  inningsList,
  toss,
  teamA,
  teamB,
  busy,
  forceSecond,
  onStart,
}: {
  inningsList: scoringApi.InningsRow[]
  toss: { winnerTeamId: number; decision: 'bat' | 'bowl' } | null
  teamA?: { id: number; name: string }
  teamB?: { id: number; name: string }
  busy: boolean
  forceSecond?: boolean
  onStart: (inningsNumber: number, batId: number, bowlId: number) => void
}) {
  const nextNumber = forceSecond ? 2 : (inningsList.filter((i) => i.status !== 'upcoming').length || 0) + 1
  let batId: number | undefined
  let bowlId: number | undefined
  if (teamA && teamB && toss) {
    const battingFirst = toss.decision === 'bat' ? toss.winnerTeamId : toss.winnerTeamId === teamA.id ? teamB.id : teamA.id
    const otherId = battingFirst === teamA.id ? teamB.id : teamA.id
    if (nextNumber === 1) {
      batId = battingFirst
      bowlId = otherId
    } else {
      batId = otherId
      bowlId = battingFirst
    }
  }
  const batName = batId === teamA?.id ? teamA?.name : teamB?.name
  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>Start innings {nextNumber}</Text>
      {batId ? (
        <Text style={styles.metaLine}>{batName} to bat. Openers &amp; bowler are picked on the scoring screen.</Text>
      ) : (
        <Text style={styles.stateSub}>Toss / teams not resolved yet.</Text>
      )}
      <TouchableOpacity
        style={[styles.primaryBtn, (!batId || busy) && styles.disabled]}
        disabled={!batId || busy}
        onPress={() => batId && bowlId && onStart(nextNumber, batId, bowlId)}
      >
        <Text style={styles.primaryBtnText}>{busy ? 'Working…' : `Start innings ${nextNumber}`}</Text>
      </TouchableOpacity>
    </View>
  )
}

function NumberPromptModal({
  prompt,
  onClose,
}: {
  prompt: { title: string; initial: number; onOk: (n: number) => void }
  onClose: () => void
}) {
  const [val, setVal] = useState(String(prompt.initial))
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>{prompt.title}</Text>
          <View style={styles.stepRow}>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <TouchableOpacity key={n} style={[styles.stepChip, val === String(n) && styles.stepChipOn]} onPress={() => setVal(String(n))}>
                <Text style={[styles.stepChipText, val === String(n) && styles.stepChipTextOn]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={styles.input} keyboardType="number-pad" value={val} onChangeText={setVal} />
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.ghostBtn} onPress={onClose}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                const n = Math.max(0, parseInt(val || '0', 10) || 0)
                onClose()
                prompt.onOk(n)
              }}
            >
              <Text style={styles.primaryBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function PlayerPickerModal({
  picker,
  players,
  onClose,
}: {
  picker: { title: string; onPick: (mpId: number) => void } | null
  players: scoringApi.MatchPlayerRow[]
  onClose: () => void
}) {
  if (!picker) return null
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>{picker.title}</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {players.map((p) => (
              <TouchableOpacity key={p.id} style={styles.pickRow} onPress={() => picker.onPick(p.id)}>
                <Text style={styles.pickName}>{p.name}</Text>
                {(p.is_captain || p.is_wicketkeeper) && (
                  <Text style={styles.pickTag}>{p.is_captain ? 'C' : ''}{p.is_wicketkeeper ? ' WK' : ''}</Text>
                )}
              </TouchableOpacity>
            ))}
            {players.length === 0 && <Text style={styles.stateSub}>No playing XI found for this team.</Text>}
          </ScrollView>
          <TouchableOpacity style={styles.ghostBtn} onPress={onClose}>
            <Text style={styles.ghostBtnText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function WicketModal({
  striker,
  nonStriker,
  playersById,
  fielders,
  onClose,
  onConfirm,
}: {
  striker: number | null
  nonStriker: number | null
  playersById: Map<number, scoringApi.MatchPlayerRow>
  fielders: scoringApi.MatchPlayerRow[]
  onClose: () => void
  onConfirm: (w: NonNullable<scoringApi.DeliveryInput['wicket']>) => void
}) {
  const [type, setType] = useState<string>('bowled')
  const [runOutId, setRunOutId] = useState<number | null>(striker)
  const [runsCompleted, setRunsCompleted] = useState('0')
  const [fielderId, setFielderId] = useState<number | null>(null)
  const isRunOut = type === 'run-out'
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>Wicket</Text>
          <View style={styles.rowWrap}>
            {DISMISSALS.map((d) => (
              <TouchableOpacity key={d} style={[styles.stepChip, type === d && styles.stepChipOn]} onPress={() => setType(d)}>
                <Text style={[styles.stepChipText, type === d && styles.stepChipTextOn]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {isRunOut && (
            <>
              <Text style={styles.fieldLabel}>Who is out?</Text>
              <View style={styles.rowWrap}>
                {[striker, nonStriker].filter((x): x is number => x != null).map((id) => (
                  <TouchableOpacity key={id} style={[styles.stepChip, runOutId === id && styles.stepChipOn]} onPress={() => setRunOutId(id)}>
                    <Text style={[styles.stepChipText, runOutId === id && styles.stepChipTextOn]}>{playersById.get(id)?.name ?? id}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Runs completed</Text>
              <TextInput style={styles.input} keyboardType="number-pad" value={runsCompleted} onChangeText={setRunsCompleted} />
            </>
          )}

          {(type === 'caught') && (
            <>
              <Text style={styles.fieldLabel}>Fielder (optional)</Text>
              <ScrollView style={{ maxHeight: 160 }}>
                {fielders.map((f) => (
                  <TouchableOpacity key={f.id} style={styles.pickRow} onPress={() => setFielderId(fielderId === f.id ? null : f.id)}>
                    <Text style={[styles.pickName, fielderId === f.id && { color: C.green, fontWeight: '800' }]}>{f.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.ghostBtn} onPress={onClose}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.wicketBtn}
              onPress={() => {
                const w: NonNullable<scoringApi.DeliveryInput['wicket']> = { type }
                if (isRunOut) {
                  w.dismissedMatchPlayerId = runOutId ?? striker ?? undefined
                  w.runsCompleted = Math.max(0, parseInt(runsCompleted || '0', 10) || 0)
                }
                if (type === 'caught' && fielderId) w.fielderMatchPlayerId = fielderId
                onConfirm(w)
              }}
            >
              <Text style={styles.wicketBtnText}>Confirm wicket</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function WagonWheelModal({
  current,
  onClose,
  onPick,
}: {
  current: ResolvedShot | null
  onClose: () => void
  onPick: (shot: ResolvedShot) => void
}) {
  const [shot, setShot] = useState<ResolvedShot | null>(current)
  const centre = WHEEL.size / 2
  const handle = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent
    const s = resolveShot(locationX - centre, locationY - centre)
    if (s) setShot(s)
  }
  const marker = shot ? { left: centre + shot.normalizedX * WHEEL.boundaryRadius - 6, top: centre + shot.normalizedY * WHEEL.boundaryRadius - 6 } : null
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>Wagon wheel — tap the shot direction</Text>
          <View
            style={[styles.wheel, { width: WHEEL.size, height: WHEEL.size, borderRadius: WHEEL.size / 2 }]}
            onStartShouldSetResponder={() => true}
            onResponderRelease={handle}
          >
            <View style={[styles.wheelInfield, { width: WHEEL.infieldRadius * 2, height: WHEEL.infieldRadius * 2, borderRadius: WHEEL.infieldRadius }]} />
            <View style={styles.wheelPitch} />
            {marker && <View style={[styles.wheelMarker, marker]} />}
          </View>
          <Text style={styles.stateSub}>{shot ? `${shot.label} (${shot.side} side)` : 'No shot selected'}</Text>
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.ghostBtn} onPress={onClose}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryBtn, !shot && styles.disabled]} disabled={!shot} onPress={() => shot && onPick(shot)}>
              <Text style={styles.primaryBtnText}>Attach shot</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.mint },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: { fontSize: Typography.fontSize.base, fontWeight: '800', color: C.navy },
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  connText: { fontSize: Typography.fontSize.xs, color: C.muted },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  content: { padding: Spacing.lg, gap: Spacing.md },
  card: { backgroundColor: C.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: C.border, padding: Spacing.lg, gap: Spacing.sm },
  teams: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: C.navy },
  vs: { color: C.faint, fontWeight: '400' },
  metaLine: { fontSize: Typography.fontSize.sm, color: C.muted },
  sectionLabel: { fontSize: Typography.fontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: C.faint },
  bigScore: { fontSize: Typography.fontSize['3xl'], fontWeight: '900', color: C.navy },
  overs: { fontSize: Typography.fontSize.lg, fontWeight: '700', color: C.muted },
  freehit: { fontSize: Typography.fontSize.xs, fontWeight: '800', color: '#B45309' },
  result: { fontSize: Typography.fontSize.base, fontWeight: '800', color: C.navy },
  notice: { fontSize: Typography.fontSize.xs, color: C.green, fontWeight: '700' },
  err: { fontSize: Typography.fontSize.xs, color: '#DC2626', fontWeight: '700' },
  stateTitle: { fontSize: Typography.fontSize.base, fontWeight: '700', color: C.navy, textAlign: 'center' },
  stateSub: { fontSize: Typography.fontSize.xs, color: C.faint, textAlign: 'center' },
  batRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 2 },
  batLabel: { width: 78, fontSize: Typography.fontSize.xs, color: C.faint, fontWeight: '700' },
  batName: { flex: 1, fontSize: Typography.fontSize.sm, color: C.navy, fontWeight: '700' },
  batStat: { fontSize: Typography.fontSize.sm, color: C.muted },
  bowlerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bowlerName: { flex: 1, fontSize: Typography.fontSize.sm, color: C.navy, fontWeight: '700' },
  link: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: C.green },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  runBtn: { minWidth: 46, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: C.greenPale, alignItems: 'center' },
  runBtnBoundary: { backgroundColor: C.green },
  runBtnText: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: C.navy },
  runBtnBoundaryText: { color: '#fff' },
  extraBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: C.borderSoft },
  extraBtnText: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: C.ink },
  wicketBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.full, backgroundColor: '#DC2626' },
  wicketBtnText: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: '#fff' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: C.borderSoft },
  ghostBtnActive: { borderColor: C.green, backgroundColor: C.greenPale },
  ghostBtnText: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: C.muted },
  primaryBtn: { marginTop: Spacing.sm, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: C.green, alignItems: 'center' },
  primaryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: '#fff' },
  disabled: { opacity: 0.45 },
  ball: { minWidth: 30, height: 30, borderRadius: 15, backgroundColor: C.greenPale, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  ballVoid: { backgroundColor: C.borderSoft },
  ballText: { fontSize: Typography.fontSize.xs, fontWeight: '800', color: C.navy },
  btn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: C.green },
  btnText: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: '#fff' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, gap: Spacing.md },
  sheetTitle: { fontSize: Typography.fontSize.base, fontWeight: '800', color: C.navy },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm },
  stepRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  stepChip: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: C.borderSoft },
  stepChipOn: { backgroundColor: C.green, borderColor: C.green },
  stepChipText: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: C.ink },
  stepChipTextOn: { color: '#fff' },
  input: { borderWidth: 1, borderColor: C.borderSoft, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: Typography.fontSize.base, color: C.navy },
  fieldLabel: { fontSize: Typography.fontSize.xs, fontWeight: '800', color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.sm },
  pickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: C.border },
  pickName: { fontSize: Typography.fontSize.sm, color: C.navy, fontWeight: '700' },
  pickTag: { fontSize: Typography.fontSize.xs, color: C.faint, fontWeight: '800' },
  wheel: { alignSelf: 'center', backgroundColor: '#DCFCE7', borderWidth: 2, borderColor: C.green, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  wheelInfield: { position: 'absolute', borderWidth: 1, borderColor: C.green, backgroundColor: '#BBF7D0' },
  wheelPitch: { position: 'absolute', width: 16, height: 90, backgroundColor: '#FDE68A', top: WHEEL.size / 2 - 90 },
  wheelMarker: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#DC2626', borderWidth: 2, borderColor: '#fff' },
})
