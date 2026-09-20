import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import {
  MatchSummary,
  MatchInningsDetail,
  MatchBattingRow,
  MatchBowlingRow,
  PlayingXiEntry,
  Partnership,
  MatchOver,
  OverDelivery,
} from '../../types'
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/colors'

// Full per-innings scorecard for GET /matches/:id/summary — the same real
// data the website's MatchSummaryPage renders (BattingScorecard /
// BowlingScorecard / FallOfWicketsPanel / MatchInfoPanel). No numbers are
// computed here; every field comes straight off buildInningsSummary. Names
// are tappable only when a real publicPlayerId exists (the server emits a
// null id for an unresolved "Unknown Player").

function fmt2(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(2)
}

function battingStatusText(row: MatchBattingRow): string {
  if (row.status === 'DNB') return 'did not bat'
  if (row.status === 'YTB') return 'yet to bat'
  return row.dismissalText || (row.status === 'NOT_OUT' ? 'not out' : '')
}

// Ported from client/src/components/match-summary/ballChip.js — pure
// presentation over already-authoritative delivery facts, no cricket rules.
function ballLabel(d: OverDelivery): string {
  if (d.voided) return '×'
  if (d.isDeadBall) return 'DB'
  if (d.wicket) return 'W'
  if (d.illegal?.type === 'wide') return `WD${d.illegal.runs > 1 ? `+${d.illegal.runs - 1}` : ''}`
  if (d.illegal?.type === 'no-ball') return `NB${d.batRuns ? `+${d.batRuns}` : ''}`
  if (d.extra?.type === 'bye') return `${d.extra.runs}B`
  if (d.extra?.type === 'leg-bye') return `${d.extra.runs}LB`
  if (d.totalRuns === 0) return '•'
  return String(d.totalRuns)
}

function ballColors(d: OverDelivery): { bg: string; fg: string } {
  if (d.wicket) return { bg: Colors.error, fg: Colors.white }
  if (d.totalRuns === 6) return { bg: '#7C3AED', fg: Colors.white }
  if (d.totalRuns === 4) return { bg: Colors.warning, fg: '#3D2E00' }
  if (d.illegal || d.extra) return { bg: '#FDE9C8', fg: '#7A5B00' }
  if (d.voided) return { bg: Colors.backgroundAlt, fg: Colors.textTertiary }
  return { bg: Colors.border, fg: Colors.text }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MatchScorecard({ summary }: { summary: MatchSummary }) {
  const router = useRouter()
  const innings = summary.innings.filter((i) => Array.isArray(i.batting))
  const [activeIdx, setActiveIdx] = useState(0)

  const openPlayer = (publicPlayerId: string | null) => {
    if (publicPlayerId) router.push(`/(tabs)/players/${publicPlayerId}` as any)
  }
  const openTeam = (teamId: number) => router.push(`/(tabs)/teams/${teamId}` as any)

  const teamName = (teamId: number): string => {
    if (teamId === summary.teams.teamA.id) return summary.teams.teamA.shortName || summary.teams.teamA.name
    if (teamId === summary.teams.teamB.id) return summary.teams.teamB.shortName || summary.teams.teamB.name
    return 'Innings'
  }

  const active: MatchInningsDetail | undefined = innings[Math.min(activeIdx, innings.length - 1)]

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="scoreboard-outline" size={18} color={Colors.primary} />
        <Text style={styles.title}>Scorecard</Text>
      </View>

      {innings.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>The scorecard will appear once play begins.</Text>
        </View>
      ) : (
        <>
          {innings.length > 1 && (
            <View style={styles.inningsTabs}>
              {innings.map((inn, idx) => (
                <TouchableOpacity
                  key={inn.inningsId}
                  onPress={() => setActiveIdx(idx)}
                  style={[styles.inningsTab, idx === activeIdx && styles.inningsTabActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: idx === activeIdx }}
                >
                  <Text style={[styles.inningsTabText, idx === activeIdx && styles.inningsTabTextActive]} numberOfLines={1}>
                    {teamName(inn.battingTeamId)} {inn.inningsNumber > 2 ? `(${inn.inningsNumber})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {active && (
            <InningsBlock
              innings={active}
              teamLabel={teamName(active.battingTeamId)}
              onTeam={() => openTeam(active.battingTeamId)}
              onPlayer={openPlayer}
            />
          )}
        </>
      )}

      {/* Playing XI */}
      {(summary.playingXi.teamA.length > 0 || summary.playingXi.teamB.length > 0) && (
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Playing XI</Text>
          <View style={styles.xiColumns}>
            <XiList
              title={summary.teams.teamA.shortName || summary.teams.teamA.name}
              entries={summary.playingXi.teamA}
              onTeam={() => openTeam(summary.teams.teamA.id)}
              onPlayer={openPlayer}
            />
            <XiList
              title={summary.teams.teamB.shortName || summary.teams.teamB.name}
              entries={summary.playingXi.teamB}
              onTeam={() => openTeam(summary.teams.teamB.id)}
              onPlayer={openPlayer}
            />
          </View>
        </View>
      )}

      {/* Match Info */}
      <View style={styles.card}>
        <Text style={styles.cardHeading}>Match Info</Text>
        <InfoRow label="Date" value={formatDateTime(summary.match.matchDate)} />
        {summary.match.venue ? <InfoRow label="Venue" value={summary.match.venue} /> : null}
        <InfoRow label="Overs" value={summary.match.oversPerInnings != null ? String(summary.match.oversPerInnings) : 'Unlimited'} />
        <InfoRow label="Balls / Over" value={String(summary.match.ballsPerOver)} />
        {summary.toss ? <InfoRow label="Toss" value={summary.toss.text} /> : null}
        {summary.result ? <InfoRow label="Result" value={summary.result.text} isLast /> : null}
      </View>
    </View>
  )
}

function InningsBlock({
  innings,
  teamLabel,
  onTeam,
  onPlayer,
}: {
  innings: MatchInningsDetail
  teamLabel: string
  onTeam: () => void
  onPlayer: (id: string | null) => void
}) {
  const batting = innings.batting ?? []
  const bowling = innings.bowling ?? []
  const batted = batting.filter((r) => r.status === 'OUT' || r.status === 'NOT_OUT')
  const ytb = batting.filter((r) => r.status === 'YTB').map((r) => r.player.name)
  const dnb = batting.filter((r) => r.status === 'DNB').map((r) => r.player.name)
  const fow = innings.fallOfWickets ?? []

  return (
    <View style={styles.card}>
      <View style={styles.inningsHeader}>
        <TouchableOpacity style={styles.inningsTeamWrap} onPress={onTeam} accessibilityRole="button" accessibilityLabel={`View ${teamLabel} team profile`}>
          <Text style={[styles.inningsTeam, styles.linkText]} numberOfLines={1}>
            {teamLabel}
          </Text>
        </TouchableOpacity>
        <Text style={styles.inningsScore}>
          {innings.score.runs}/{innings.score.wickets}
          <Text style={styles.inningsOvers}> ({innings.score.oversLabel} ov)</Text>
        </Text>
      </View>

      {/* Batting */}
      <View style={styles.tableHeadRow}>
        <Text style={[styles.th, styles.thName]}>Batter</Text>
        <Text style={[styles.th, styles.thNum]}>R</Text>
        <Text style={[styles.th, styles.thNum]}>B</Text>
        <Text style={[styles.th, styles.thNum]}>4s</Text>
        <Text style={[styles.th, styles.thNum]}>6s</Text>
        <Text style={[styles.th, styles.thNumWide]}>SR</Text>
      </View>
      {batted.map((row, i) => (
        <TouchableOpacity
          key={`${row.player.publicPlayerId ?? 'unknown'}-${i}`}
          style={styles.tableRow}
          disabled={!row.player.publicPlayerId}
          onPress={() => onPlayer(row.player.publicPlayerId)}
          accessibilityRole={row.player.publicPlayerId ? 'button' : undefined}
        >
          <View style={styles.tdName}>
            <Text style={[styles.playerName, !!row.player.publicPlayerId && styles.playerNameLink]} numberOfLines={1}>
              {row.player.name}
            </Text>
            <Text style={styles.dismissal} numberOfLines={1}>
              {battingStatusText(row)}
            </Text>
          </View>
          <Text style={[styles.td, styles.thNum, styles.tdStrong]}>{row.runs ?? 0}</Text>
          <Text style={[styles.td, styles.thNum]}>{row.balls ?? 0}</Text>
          <Text style={[styles.td, styles.thNum]}>{row.fours ?? 0}</Text>
          <Text style={[styles.td, styles.thNum]}>{row.sixes ?? 0}</Text>
          <Text style={[styles.td, styles.thNumWide]}>{fmt2(row.strikeRate)}</Text>
        </TouchableOpacity>
      ))}

      {innings.extras && (
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>Extras</Text>
          <Text style={styles.subtotalValue}>
            {innings.extras.total}{' '}
            <Text style={styles.subtotalHint}>
              (w {innings.extras.wides}, nb {innings.extras.noBalls}, b {innings.extras.byes}, lb {innings.extras.legByes})
            </Text>
          </Text>
        </View>
      )}
      {innings.total && (
        <View style={styles.subtotalRow}>
          <Text style={[styles.subtotalLabel, styles.tdStrong]}>Total</Text>
          <Text style={[styles.subtotalValue, styles.tdStrong]}>
            {innings.total.runs}/{innings.total.wickets} ({innings.total.oversLabel} ov, RR {innings.total.runRate.toFixed(2)})
          </Text>
        </View>
      )}

      {ytb.length > 0 && <CaptionLine label="Yet to Bat" value={ytb.join(', ')} />}
      {dnb.length > 0 && <CaptionLine label="Did Not Bat" value={dnb.join(', ')} />}

      {/* Fall of wickets */}
      {fow.length > 0 && (
        <View style={styles.fowBlock}>
          <Text style={styles.blockLabel}>Fall of Wickets</Text>
          <View style={styles.fowChips}>
            {fow.map((f) => (
              <View key={f.wicketNumber} style={styles.fowChip}>
                <Text style={styles.fowChipText}>
                  <Text style={styles.tdStrong}>
                    {f.wicketNumber}-{f.score}
                  </Text>{' '}
                  ({f.player.name}, {f.overBall})
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Bowling */}
      <View style={[styles.tableHeadRow, styles.bowlingHead]}>
        <Text style={[styles.th, styles.thName]}>Bowler</Text>
        <Text style={[styles.th, styles.thNumWide]}>O</Text>
        <Text style={[styles.th, styles.thNum]}>M</Text>
        <Text style={[styles.th, styles.thNum]}>R</Text>
        <Text style={[styles.th, styles.thNum]}>W</Text>
        <Text style={[styles.th, styles.thNumWide]}>Econ</Text>
      </View>
      {bowling.length === 0 ? (
        <Text style={styles.noneYet}>Nobody has bowled yet.</Text>
      ) : (
        bowling.map((row: MatchBowlingRow, i) => (
          <TouchableOpacity
            key={`${row.player.publicPlayerId ?? 'unknown'}-${i}`}
            style={styles.tableRow}
            disabled={!row.player.publicPlayerId}
            onPress={() => onPlayer(row.player.publicPlayerId)}
            accessibilityRole={row.player.publicPlayerId ? 'button' : undefined}
          >
            <View style={styles.tdName}>
              <Text style={[styles.playerName, !!row.player.publicPlayerId && styles.playerNameLink]} numberOfLines={1}>
                {row.player.name}
              </Text>
              {(row.wides > 0 || row.noBalls > 0) && (
                <Text style={styles.dismissal} numberOfLines={1}>
                  wd {row.wides}, nb {row.noBalls}
                </Text>
              )}
            </View>
            <Text style={[styles.td, styles.thNumWide]}>{row.oversLabel}</Text>
            <Text style={[styles.td, styles.thNum]}>{row.maidens}</Text>
            <Text style={[styles.td, styles.thNum]}>{row.runs}</Text>
            <Text style={[styles.td, styles.thNum, styles.tdStrong]}>{row.wickets}</Text>
            <Text style={[styles.td, styles.thNumWide]}>{fmt2(row.economy)}</Text>
          </TouchableOpacity>
        ))
      )}

      <PartnershipsBlock partnerships={innings.partnerships ?? []} />
      <OverByOver overs={innings.overs ?? []} />
    </View>
  )
}

function PartnershipsBlock({ partnerships }: { partnerships: Partnership[] }) {
  if (partnerships.length === 0) return null
  return (
    <View style={styles.pshipBlock}>
      <Text style={styles.blockLabel}>Partnerships</Text>
      {partnerships.map((p, i) => (
        <View key={i} style={styles.pshipRow}>
          <Text style={styles.pshipNames} numberOfLines={1}>
            {p.batsmen.map((b) => b.name).join(' & ')}
            {p.unbeaten ? <Text style={styles.pshipUnbeaten}>  unbeaten</Text> : null}
          </Text>
          <Text style={styles.pshipValue}>
            {p.runs} <Text style={styles.pshipBalls}>({p.balls})</Text>
          </Text>
        </View>
      ))}
    </View>
  )
}

function OverByOver({ overs }: { overs: MatchOver[] }) {
  const [open, setOpen] = useState(false)
  if (overs.length === 0) return null
  return (
    <View style={styles.oversBlock}>
      <TouchableOpacity
        style={styles.oversToggle}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.blockLabel}>Over by Over</Text>
        <View style={styles.oversToggleRight}>
          <Text style={styles.oversToggleHint}>
            {overs.length} {overs.length === 1 ? 'over' : 'overs'}
          </Text>
          <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textTertiary} />
        </View>
      </TouchableOpacity>

      {open &&
        overs
          .slice()
          .reverse()
          .map((over) => (
            <View key={over.over} style={styles.overCard}>
              <View style={styles.overHead}>
                <Text style={styles.overTitle} numberOfLines={1}>
                  Over {over.over}
                  {over.bowler?.name ? <Text style={styles.overBowler}>  ·  {over.bowler.name}</Text> : null}
                </Text>
                <Text style={styles.overRuns}>
                  {over.runs} {over.runs === 1 ? 'run' : 'runs'}
                  {over.wickets > 0 ? ` · ${over.wickets}w` : ''}
                </Text>
              </View>
              <View style={styles.ballRow}>
                {over.deliveries.map((d) => {
                  const c = ballColors(d)
                  return (
                    <View key={d.id} style={[styles.ballChip, { backgroundColor: c.bg }]}>
                      <Text style={[styles.ballChipText, { color: c.fg }]}>{ballLabel(d)}</Text>
                    </View>
                  )
                })}
              </View>
              <Text style={styles.overScoreAfter}>Score: {over.scoreAfter}</Text>
            </View>
          ))}
    </View>
  )
}

function CaptionLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.captionLine}>
      <Text style={styles.blockLabel}>{label}</Text>
      <Text style={styles.captionValue}>{value}</Text>
    </View>
  )
}

function XiList({
  title,
  entries,
  onTeam,
  onPlayer,
}: {
  title: string
  entries: PlayingXiEntry[]
  onTeam: () => void
  onPlayer: (id: string | null) => void
}) {
  return (
    <View style={styles.xiCol}>
      <TouchableOpacity onPress={onTeam} accessibilityRole="button" accessibilityLabel={`View ${title} team profile`}>
        <Text style={[styles.xiTitle, styles.linkText]} numberOfLines={1}>
          {title}
        </Text>
      </TouchableOpacity>
      {entries.map((e, i) => (
        <TouchableOpacity
          key={`${e.player.publicPlayerId ?? 'x'}-${i}`}
          disabled={!e.player.publicPlayerId}
          onPress={() => onPlayer(e.player.publicPlayerId)}
          style={styles.xiRow}
          accessibilityRole={e.player.publicPlayerId ? 'button' : undefined}
        >
          <Text style={[styles.xiName, !!e.player.publicPlayerId && styles.playerNameLink]} numberOfLines={1}>
            {e.player.name}
            {e.isCaptain ? <Text style={styles.xiBadge}> (C)</Text> : null}
            {e.isWicketkeeper ? <Text style={styles.xiBadgeWk}> (WK)</Text> : null}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

function InfoRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View style={[styles.infoRow, isLast && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  emptyCard: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  inningsTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  inningsTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inningsTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  inningsTabText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.textSecondary },
  inningsTabTextActive: { color: Colors.white },
  card: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  cardHeading: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  inningsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  inningsTeamWrap: { flex: 1, marginRight: Spacing.sm },
  inningsTeam: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  linkText: { color: Colors.primary },
  inningsScore: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  inningsOvers: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.normal, color: Colors.textTertiary },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  bowlingHead: { marginTop: Spacing.md },
  th: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  thName: { flex: 1 },
  thNum: { width: 30, textAlign: 'right' },
  thNumWide: { width: 46, textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  tdName: { flex: 1, paddingRight: Spacing.sm },
  playerName: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.text },
  playerNameLink: { color: Colors.primary },
  dismissal: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: 1 },
  td: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  tdStrong: { color: Colors.text, fontWeight: Typography.fontWeight.bold },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.xs,
    marginTop: Spacing.xs,
    gap: Spacing.md,
  },
  subtotalLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  subtotalValue: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, flexShrink: 1, textAlign: 'right' },
  subtotalHint: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary },
  captionLine: { marginTop: Spacing.sm },
  blockLabel: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  captionValue: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  fowBlock: { marginTop: Spacing.md },
  fowChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  fowChip: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fowChipText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  noneYet: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary, paddingVertical: Spacing.sm },
  pshipBlock: { marginTop: Spacing.md },
  pshipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  pshipNames: { flex: 1, fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  pshipUnbeaten: { fontSize: Typography.fontSize.xs, color: Colors.success, fontWeight: Typography.fontWeight.semibold },
  pshipValue: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  pshipBalls: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.normal, color: Colors.textTertiary },
  oversBlock: { marginTop: Spacing.md },
  oversToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  oversToggleRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  oversToggleHint: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary },
  overCard: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    backgroundColor: Colors.background,
  },
  overHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  overTitle: { flex: 1, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  overBowler: { fontWeight: Typography.fontWeight.normal, color: Colors.textTertiary },
  overRuns: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.textSecondary },
  ballRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: Spacing.sm },
  ballChip: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  ballChipText: { fontSize: 11, fontWeight: Typography.fontWeight.bold },
  overScoreAfter: { marginTop: Spacing.sm, fontSize: Typography.fontSize.xs, color: Colors.primary, fontWeight: Typography.fontWeight.semibold, textAlign: 'right' },
  xiColumns: { flexDirection: 'row', gap: Spacing.md },
  xiCol: { flex: 1 },
  xiTitle: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  xiRow: { paddingVertical: 5 },
  xiName: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  xiBadge: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.secondary },
  xiBadgeWk: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.primary },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary, flexShrink: 0 },
  infoValue: { fontSize: Typography.fontSize.sm, color: Colors.text, fontWeight: Typography.fontWeight.medium, flex: 1, textAlign: 'right' },
})
