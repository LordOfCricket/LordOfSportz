import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useTournamentDetail } from '../../../src/hooks/useTournaments'
import {
  TournamentFixture,
  StandingsRow,
  TournamentStandings,
  TournamentTopRunScorer,
  TournamentTopWicketTaker,
} from '../../../src/services/tournamentApi'
import {
  formatLabel,
  statusLabel,
  stageLabel,
  formatDateRange,
  formatMatchDateTime,
  nrrDisplay,
  STAGE_LABELS,
  KNOCKOUT_STAGE_ORDER,
} from '../../../src/constants/tournamentLabels'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { shareEntity } from '../../../src/lib/shareEntity'

type SectionKey = 'Overview' | 'Fixtures' | 'Results' | 'Standings' | 'Bracket' | 'Teams' | 'Stats'

function num(v: number | null | undefined, digits = 1): string {
  return v == null ? '—' : v.toFixed(digits)
}

// Best single innings / best figures among the tournament's leading players —
// real values already on every topRunScorers[].highestScore /
// topWicketTakers[].bestBowling (shown nowhere until now). Sorting mirrors
// leaderboardConfig.js: highest score by runs desc; best bowling by wickets
// desc then runs asc.
function bestTournamentInnings(top: TournamentTopRunScorer[]): TournamentTopRunScorer | null {
  return top.reduce<TournamentTopRunScorer | null>((best, p) => {
    if (!p.highestScore) return best
    if (!best || !best.highestScore || p.highestScore.runs > best.highestScore.runs) return p
    return best
  }, null)
}
function bestTournamentFigures(top: TournamentTopWicketTaker[]): TournamentTopWicketTaker | null {
  return top.reduce<TournamentTopWicketTaker | null>((best, p) => {
    if (!p.bestBowling) return best
    if (!best || !best.bestBowling) return p
    const a = p.bestBowling
    const b = best.bestBowling
    if (a.wickets > b.wickets || (a.wickets === b.wickets && a.runs < b.runs)) return p
    return best
  }, null)
}

function hasStandings(s: TournamentStandings): boolean {
  if (!s) return false
  if ('overall' in s) return s.overall.length > 0
  return s.groupA.length > 0 || s.groupB.length > 0
}

export default function TournamentDetailScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { publicTournamentId } = useLocalSearchParams<{ publicTournamentId: string }>()
  const { data, isPending, isError, error, refetch } = useTournamentDetail(publicTournamentId ?? null)
  const [section, setSection] = useState<SectionKey>('Overview')

  const fixtures = useMemo(() => data?.fixtures ?? [], [data?.fixtures])
  const upcoming = useMemo(() => fixtures.filter((f) => f.matchStatus !== 'finalized'), [fixtures])
  const results = useMemo(() => fixtures.filter((f) => f.matchStatus === 'finalized'), [fixtures])

  const openMatch = (matchId: number | null) => {
    if (matchId) router.push(`/(tabs)/matches/${matchId}` as any)
  }
  const openTeam = (teamId: number | null) => {
    if (teamId) router.push(`/(tabs)/teams/${teamId}` as any)
  }
  const openPlayer = (publicPlayerId: string) => router.push(`/(tabs)/players/${publicPlayerId}` as any)

  if (isPending) return <LoadingScreen />

  if (isError || !data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header onBack={() => router.back()} title="Tournament" />
        <ErrorScreen
          title="Tournament Unavailable"
          message={(error as any)?.response?.status === 404 ? 'This tournament could not be found.' : 'Could not load this tournament.'}
          onRetry={() => refetch()}
          retryLabel="Retry"
        />
      </View>
    )
  }

  const { tournament, teams, squad, standings, analytics } = data
  const overallStandings = standings && 'overall' in standings ? standings.overall : null
  const groupStandings = standings && 'groupA' in standings ? standings : null
  const knockoutFixtures = fixtures.filter((f) => (KNOCKOUT_STAGE_ORDER as readonly string[]).includes(f.stage))
  const sections: SectionKey[] = [
    'Overview',
    'Fixtures',
    'Results',
    ...(hasStandings(standings) ? (['Standings'] as SectionKey[]) : []),
    ...(knockoutFixtures.length > 0 ? (['Bracket'] as SectionKey[]) : []),
    'Teams',
    'Stats',
  ]

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        onBack={() => router.back()}
        title="Tournament"
        right={
          <TouchableOpacity
            onPress={() =>
              shareEntity({
                title: tournament.name,
                message:
                  tournament.status === 'COMPLETED' && tournament.championTeamName
                    ? `${tournament.name} — won by ${tournament.championTeamName} on Lord Of Cricket`
                    : `${tournament.name} on Lord Of Cricket`,
                path: `/tournaments/${tournament.publicTournamentId}`,
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Share this tournament"
            hitSlop={8}
          >
            <MaterialCommunityIcons name="share-variant" size={20} color={Colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroFormat}>{formatLabel(tournament.format)}</Text>
          <Text style={styles.heroName}>{tournament.name}</Text>
          {tournament.description ? <Text style={styles.heroDesc}>{tournament.description}</Text> : null}
          <View style={styles.heroMetaRow}>
            <Meta icon="calendar-range" text={formatDateRange(tournament.startDate, tournament.endDate)} />
            <Meta icon="account-group" text={`${teams.length}/${tournament.maxTeams} teams`} />
            {tournament.oversPerInnings != null ? <Meta icon="numeric" text={`${tournament.oversPerInnings} overs`} /> : null}
            <Meta icon="flag-outline" text={statusLabel(tournament.status)} />
          </View>
          {tournament.status === 'COMPLETED' && tournament.championTeamName ? (
            <TouchableOpacity
              style={styles.championBox}
              disabled={!tournament.championTeamId}
              onPress={() => openTeam(tournament.championTeamId)}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="trophy" size={20} color={Colors.secondary} />
              <View>
                <Text style={styles.championLabel}>Champion</Text>
                <Text style={styles.championName}>{tournament.championTeamName}</Text>
              </View>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Section switcher */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {sections.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setSection(s)}
              style={[styles.chip, section === s && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: section === s }}
            >
              <Text style={[styles.chipText, section === s && styles.chipTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.sectionBody}>
          {section === 'Overview' && (
            <>
              <Text style={styles.blockTitle}>Next Up</Text>
              {upcoming.length === 0 ? (
                <Text style={styles.muted}>No upcoming fixtures.</Text>
              ) : (
                upcoming.slice(0, 3).map((f) => <FixtureRow key={f.id} fixture={f} onOpenMatch={openMatch} />)
              )}
              <Text style={[styles.blockTitle, styles.blockTitleSpaced]}>Recent Results</Text>
              {results.length === 0 ? (
                <Text style={styles.muted}>No results yet.</Text>
              ) : (
                results.slice(-3).reverse().map((f) => <FixtureRow key={f.id} fixture={f} onOpenMatch={openMatch} />)
              )}
            </>
          )}

          {section === 'Fixtures' && (
            <>
              {upcoming.length === 0 ? (
                <Text style={styles.muted}>No upcoming fixtures.</Text>
              ) : (
                upcoming.map((f) => <FixtureRow key={f.id} fixture={f} onOpenMatch={openMatch} />)
              )}
            </>
          )}

          {section === 'Results' && (
            <>
              {results.length === 0 ? (
                <Text style={styles.muted}>No results yet.</Text>
              ) : (
                results.map((f) => <FixtureRow key={f.id} fixture={f} onOpenMatch={openMatch} />)
              )}
            </>
          )}

          {section === 'Standings' && (
            <View style={{ gap: Spacing.md }}>
              {overallStandings && <StandingsTable rows={overallStandings} onOpenTeam={openTeam} />}
              {groupStandings && (
                <>
                  <StandingsTable title="Group A" rows={groupStandings.groupA} onOpenTeam={openTeam} />
                  <StandingsTable title="Group B" rows={groupStandings.groupB} onOpenTeam={openTeam} />
                </>
              )}
            </View>
          )}

          {section === 'Bracket' && (
            <BracketView fixtures={knockoutFixtures} onOpenTeam={openTeam} onOpenMatch={openMatch} />
          )}

          {section === 'Teams' && (
            <>
              {teams.length === 0 ? (
                <Text style={styles.muted}>No teams registered yet.</Text>
              ) : (
                teams.map((t) => {
                  const playerCount = squad.filter((s) => s.tournamentTeamId === t.id).length
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={styles.teamRow}
                      onPress={() => openTeam(t.teamId)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${t.teamName}`}
                    >
                      <View style={styles.teamRowInfo}>
                        <Text style={styles.teamRowName} numberOfLines={1}>
                          {t.teamName}
                        </Text>
                        {t.groupName ? <Text style={styles.teamRowSub}>Group {t.groupName}</Text> : null}
                      </View>
                      <Text style={styles.teamRowCount}>
                        {playerCount} {playerCount === 1 ? 'player' : 'players'}
                      </Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  )
                })
              )}
            </>
          )}

          {section === 'Stats' && (
            <View style={{ gap: Spacing.lg }}>
              <View>
                <Text style={styles.blockTitle}>Tournament Analytics</Text>
                <View style={styles.tileGrid}>
                  <Tile label="Finalized" value={`${analytics.finalizedMatches}/${analytics.totalFixtures}`} />
                  <Tile label="Total Runs" value={String(analytics.totalRuns)} />
                  <Tile label="Total Wickets" value={String(analytics.totalWickets)} />
                  <Tile label="Avg 1st Inns" value={num(analytics.averageFirstInningsScore, 1)} />
                  <Tile label="Highest Total" value={analytics.highestTeamTotal == null ? '—' : String(analytics.highestTeamTotal)} />
                  <Tile label="Lowest Total" value={analytics.lowestTeamTotal == null ? '—' : String(analytics.lowestTeamTotal)} />
                </View>
              </View>
              {(() => {
                const bestInn = bestTournamentInnings(analytics.topRunScorers)
                const bestFig = bestTournamentFigures(analytics.topWicketTakers)
                if (analytics.highestTeamTotal == null && !bestInn && !bestFig) return null
                return (
                  <View>
                    <Text style={styles.blockTitle}>Tournament Records</Text>
                    <Text style={styles.recordsNote}>From this tournament&apos;s finalized matches and leading players.</Text>
                    <View style={styles.recordsList}>
                      <View style={styles.recordRow}>
                        <Text style={styles.recordLabel}>Highest Team Total</Text>
                        <Text style={styles.recordValue}>
                          {analytics.highestTeamTotal == null ? '—' : String(analytics.highestTeamTotal)}
                        </Text>
                      </View>
                      <View style={styles.recordRow}>
                        <Text style={styles.recordLabel}>Highest Score</Text>
                        {bestInn && bestInn.highestScore ? (
                          <Text style={styles.recordValue}>
                            {bestInn.highestScore.runs}
                            {bestInn.highestScore.notOut ? '*' : ''}{' '}
                            <Text style={styles.recordName} onPress={() => openPlayer(bestInn.player.publicPlayerId)}>
                              {bestInn.player.name}
                            </Text>
                          </Text>
                        ) : (
                          <Text style={styles.recordValue}>—</Text>
                        )}
                      </View>
                      <View style={styles.recordRow}>
                        <Text style={styles.recordLabel}>Best Bowling</Text>
                        {bestFig && bestFig.bestBowling ? (
                          <Text style={styles.recordValue}>
                            {bestFig.bestBowling.wickets}/{bestFig.bestBowling.runs}{' '}
                            <Text style={styles.recordName} onPress={() => openPlayer(bestFig.player.publicPlayerId)}>
                              {bestFig.player.name}
                            </Text>
                          </Text>
                        ) : (
                          <Text style={styles.recordValue}>—</Text>
                        )}
                      </View>
                    </View>
                  </View>
                )
              })()}
              <View>
                <Text style={styles.blockTitle}>Top Run Scorers</Text>
                {analytics.topRunScorers.length === 0 ? (
                  <Text style={styles.muted}>No batting data yet.</Text>
                ) : (
                  analytics.topRunScorers.map((p, i) => (
                    <StatLeaderRow
                      key={p.player.publicPlayerId}
                      rank={i + 1}
                      name={p.player.name}
                      value={`${p.runs} runs`}
                      sub={p.average != null ? `avg ${p.average.toFixed(1)}` : undefined}
                      onPress={() => openPlayer(p.player.publicPlayerId)}
                    />
                  ))
                )}
              </View>
              <View>
                <Text style={styles.blockTitle}>Top Wicket Takers</Text>
                {analytics.topWicketTakers.length === 0 ? (
                  <Text style={styles.muted}>No bowling data yet.</Text>
                ) : (
                  analytics.topWicketTakers.map((p, i) => (
                    <StatLeaderRow
                      key={p.player.publicPlayerId}
                      rank={i + 1}
                      name={p.player.name}
                      value={`${p.wickets} wkts`}
                      sub={p.economy != null ? `econ ${p.economy.toFixed(1)}` : undefined}
                      onPress={() => openPlayer(p.player.publicPlayerId)}
                    />
                  ))
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

function Header({ onBack, title, right }: { onBack: () => void; title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back">
        <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 22, alignItems: 'flex-end' }}>{right ?? null}</View>
    </View>
  )
}

function Meta({ icon, text }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; text: string }) {
  return (
    <View style={styles.meta}>
      <MaterialCommunityIcons name={icon} size={13} color={Colors.textTertiary} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  )
}

function FixtureRow({ fixture, onOpenMatch }: { fixture: TournamentFixture; onOpenMatch: (id: number | null) => void }) {
  const finalized = fixture.matchStatus === 'finalized'
  const live = fixture.matchStatus === 'live'
  return (
    <View style={styles.fixture}>
      <View style={styles.fixtureInfo}>
        <Text style={styles.fixtureStage}>{stageLabel(fixture)}</Text>
        <Text style={styles.fixtureTeams} numberOfLines={2}>
          {fixture.teamA.name || 'TBD'} vs {fixture.teamB.name || 'TBD'}
        </Text>
        <Text style={styles.fixtureDate}>{formatMatchDateTime(fixture.matchDate)}</Text>
        {finalized && fixture.resultText ? <Text style={styles.fixtureResult}>{fixture.resultText}</Text> : null}
        {fixture.awaitingResolution ? <Text style={styles.fixtureTiebreak}>Tie-break required</Text> : null}
      </View>
      {fixture.matchId ? (
        <TouchableOpacity
          style={styles.fixtureBtn}
          onPress={() => onOpenMatch(fixture.matchId)}
          accessibilityRole="button"
          accessibilityLabel="Open match"
        >
          <Text style={styles.fixtureBtnText}>{finalized ? 'Scorecard' : live ? 'Live' : 'Match'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function StandingsTable({
  rows,
  title,
  onOpenTeam,
}: {
  rows: StandingsRow[]
  title?: string
  onOpenTeam: (teamId: number) => void
}) {
  if (!rows || rows.length === 0) return null
  return (
    <View style={styles.tableCard}>
      {title ? <Text style={styles.tableTitle}>{title}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.stRow, styles.stHeadRow]}>
            <Text style={[styles.stCell, styles.stPos, styles.stHead]}>#</Text>
            <Text style={[styles.stCell, styles.stTeam, styles.stHead]}>Team</Text>
            {['P', 'W', 'L', 'T', 'NR', 'Pts', 'NRR'].map((h) => (
              <Text key={h} style={[styles.stCell, h === 'NRR' ? styles.stNrr : styles.stNum, styles.stHead]}>
                {h}
              </Text>
            ))}
          </View>
          {rows.map((r) => (
            <View key={r.teamId} style={styles.stRow}>
              <Text style={[styles.stCell, styles.stPos]}>{r.position}</Text>
              <TouchableOpacity style={styles.stTeam} onPress={() => onOpenTeam(r.teamId)} accessibilityRole="button">
                <Text style={styles.stTeamText} numberOfLines={1}>
                  {r.teamShort || r.teamName}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.stCell, styles.stNum]}>{r.played}</Text>
              <Text style={[styles.stCell, styles.stNum]}>{r.won}</Text>
              <Text style={[styles.stCell, styles.stNum]}>{r.lost}</Text>
              <Text style={[styles.stCell, styles.stNum]}>{r.tied}</Text>
              <Text style={[styles.stCell, styles.stNum]}>{r.noResult}</Text>
              <Text style={[styles.stCell, styles.stNum, styles.stPts]}>{r.points}</Text>
              <Text style={[styles.stCell, styles.stNrr]}>{nrrDisplay(r.nrr)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

function StatLeaderRow({
  rank,
  name,
  value,
  sub,
  onPress,
}: {
  rank: number
  name: string
  value: string
  sub?: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.leaderRow} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${name}`}>
      <Text style={styles.leaderRank}>{rank}</Text>
      <Text style={styles.leaderName} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.leaderValueWrap}>
        <Text style={styles.leaderValue}>{value}</Text>
        {sub ? <Text style={styles.leaderSub}>{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  )
}

// Native port of client/src/components/tournaments/BracketView.jsx — one
// column per knockout stage present (QF -> SF -> F), each fixture a card
// with two team lines and a winner highlight. No connector-line SVG, same
// "correctness first, horizontal scroll" choice the website made.
function BracketView({
  fixtures,
  onOpenTeam,
  onOpenMatch,
}: {
  fixtures: TournamentFixture[]
  onOpenTeam: (teamId: number | null) => void
  onOpenMatch: (matchId: number | null) => void
}) {
  const stages = (KNOCKOUT_STAGE_ORDER as readonly string[]).filter((s) => fixtures.some((f) => f.stage === s))
  if (stages.length === 0) {
    return <Text style={styles.muted}>The knockout bracket will appear once the group/qualifying stage is complete.</Text>
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bracketRow}>
      {stages.map((stage) => {
        const stageFixtures = fixtures
          .filter((f) => f.stage === stage)
          .slice()
          .sort((a, b) => (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0))
        return (
          <View key={stage} style={styles.bracketCol}>
            <Text style={styles.bracketStage}>{STAGE_LABELS[stage] || stage}</Text>
            {stageFixtures.map((f) => {
              const winnerId = f.winnerTeamId ?? f.manualResultWinnerTeamId
              return (
                <View key={f.id} style={styles.bracketCard}>
                  <BracketTeamLine name={f.teamA.name} teamId={f.teamA.id} isWinner={!!winnerId && winnerId === f.teamA.id} onOpenTeam={onOpenTeam} />
                  <View style={styles.bracketDivider} />
                  <BracketTeamLine name={f.teamB.name} teamId={f.teamB.id} isWinner={!!winnerId && winnerId === f.teamB.id} onOpenTeam={onOpenTeam} />
                  {f.awaitingResolution ? <Text style={styles.bracketTiebreak}>Tie-break required</Text> : null}
                  {f.matchId ? (
                    <TouchableOpacity
                      style={styles.bracketMatchBtn}
                      onPress={() => onOpenMatch(f.matchId)}
                      accessibilityRole="button"
                      accessibilityLabel="Open match"
                    >
                      <Text style={styles.bracketMatchBtnText}>
                        {f.matchStatus === 'finalized' ? 'Scorecard' : f.matchStatus === 'live' ? 'Live' : 'View match'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )
            })}
          </View>
        )
      })}
    </ScrollView>
  )
}

function BracketTeamLine({
  name,
  teamId,
  isWinner,
  onOpenTeam,
}: {
  name: string | null
  teamId: number | null
  isWinner: boolean
  onOpenTeam: (teamId: number | null) => void
}) {
  if (!teamId || !name) {
    return <Text style={styles.bracketTbd}>TBD</Text>
  }
  return (
    <TouchableOpacity onPress={() => onOpenTeam(teamId)} accessibilityRole="button" accessibilityLabel={`Open ${name}`}>
      <Text style={[styles.bracketTeam, isWinner && styles.bracketTeamWinner]} numberOfLines={1}>
        {isWinner ? '🏆 ' : ''}
        {name}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  scroll: { paddingBottom: Spacing['3xl'] },
  hero: { padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm },
  heroFormat: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroName: { fontSize: Typography.fontSize['2xl'], fontWeight: Typography.fontWeight.bold, color: Colors.text },
  heroDesc: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  heroMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary },
  championBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  championLabel: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  championName: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  chips: { gap: Spacing.sm, padding: Spacing.lg, paddingBottom: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
  sectionBody: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.sm },
  blockTitle: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.text, marginBottom: Spacing.xs },
  blockTitleSpaced: { marginTop: Spacing.lg },
  muted: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary, paddingVertical: Spacing.xs },
  fixture: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    marginBottom: Spacing.sm,
  },
  fixtureInfo: { flex: 1, gap: 2 },
  fixtureStage: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  fixtureTeams: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.text },
  fixtureDate: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary },
  fixtureResult: { fontSize: Typography.fontSize.xs, color: Colors.success, fontWeight: Typography.fontWeight.medium, marginTop: 2 },
  fixtureTiebreak: { fontSize: Typography.fontSize.xs, color: Colors.warning, fontWeight: Typography.fontWeight.bold, marginTop: 2 },
  fixtureBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  fixtureBtnText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  tableCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
  },
  tableTitle: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.text, marginBottom: Spacing.sm },
  stRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  stHeadRow: { borderTopWidth: 0, borderBottomWidth: 1, borderBottomColor: Colors.border },
  stCell: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, textAlign: 'center' },
  stHead: { fontWeight: Typography.fontWeight.bold, color: Colors.textTertiary, textTransform: 'uppercase' },
  stPos: { width: 26, textAlign: 'center' },
  stTeam: { width: 96, paddingRight: Spacing.sm },
  stTeamText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.primary },
  stNum: { width: 30 },
  stPts: { fontWeight: Typography.fontWeight.bold, color: Colors.text },
  stNrr: { width: 56, textAlign: 'right' },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    marginBottom: Spacing.sm,
  },
  teamRowInfo: { flex: 1 },
  teamRowName: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.text },
  teamRowSub: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  teamRowCount: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  leaderRank: { width: 20, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.textTertiary },
  leaderName: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.primary },
  leaderValueWrap: { alignItems: 'flex-end' },
  leaderValue: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  leaderSub: { fontSize: 10, color: Colors.textTertiary, marginTop: 1 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tile: {
    flexBasis: '30%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.backgroundAlt,
  },
  tileLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  tileValue: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  recordsNote: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginBottom: Spacing.sm },
  recordsList: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.backgroundAlt,
    paddingHorizontal: Spacing.md,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  recordLabel: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  recordValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  recordName: { color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  bracketRow: { gap: Spacing.md, paddingVertical: Spacing.sm, paddingRight: Spacing.lg },
  bracketCol: { width: 190, gap: Spacing.md, justifyContent: 'center' },
  bracketStage: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  bracketCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    gap: 4,
  },
  bracketDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 2 },
  bracketTeam: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  bracketTeamWinner: { fontWeight: Typography.fontWeight.bold, color: Colors.text },
  bracketTbd: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary },
  bracketTiebreak: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: Colors.warning, marginTop: 4 },
  bracketMatchBtn: {
    marginTop: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  bracketMatchBtnText: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: Colors.text },
})
