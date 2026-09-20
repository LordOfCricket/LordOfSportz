import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Trophy } from 'lucide-react'
import BackButton from '../../components/common/BackButton.jsx'
import { fetchMatch, setToss as setTossApi, startMatch as startMatchApi, finalizeMatch as finalizeMatchApi, fetchMatchInnings } from '../../services/matchApi.js'
import { fetchTeamPlayers } from '../../services/playerApi.js'
import { fetchMatchAvailability } from '../../services/matchAvailabilityApi.js'
import * as scoringApi from '../../services/scoringApi.js'
import { battingTeamIdFromToss, bowlingTeamIdFromToss } from '../../models/match.model.js'
import { roleLabel } from '../../models/player.model.js'
import Button from '../../components/ui/Button.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import PostMatchFeedbackPrompt from '../../components/feedback/PostMatchFeedbackPrompt.jsx'

function formatOvers(legalBalls, ballsPerOver) {
  return `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`
}

function inningsExtras(state) {
  const batsmenRuns = Object.values(state.batsmen).reduce((sum, b) => sum + b.runs, 0)
  return Math.max(state.score.runs - batsmenRuns, 0)
}

function topBatters(state, playersById, count = 2) {
  return Object.entries(state.batsmen)
    .map(([id, stat]) => ({ name: playersById.get(Number(id))?.name || `#${id}`, ...stat }))
    .sort((a, b) => b.runs - a.runs)
    .slice(0, count)
}

function topBowler(state, playersById) {
  const entries = Object.entries(state.bowlers).map(([id, stat]) => ({ name: playersById.get(Number(id))?.name || `#${id}`, ...stat }))
  if (entries.length === 0) return null
  return entries.sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0]
}

// Availability is informational only, shown to help the
// organizer build the roster; it never drives selection/locking itself.
const AVAILABILITY_BADGE = {
  AVAILABLE: { label: 'Available', className: 'bg-emerald-500/15 text-emerald-300' },
  NOT_AVAILABLE: { label: 'Not Available', className: 'bg-rose-500/15 text-rose-300' },
  PENDING: { label: 'Pending', className: 'bg-white/10 text-slate-400' },
}

function PlayerCheckboxList({ players, selectedIds, disabledIds, onToggle, availabilityMap }) {
  return (
    <div className="space-y-2">
      {players.map((p) => {
        const selected = selectedIds.has(p.id)
        const locked = disabledIds.has(p.id)
        const availability = availabilityMap?.get(p.id)
        const badge = availability ? AVAILABILITY_BADGE[availability] : null
        return (
          <button
            key={p.id}
            type="button"
            disabled={locked}
            onClick={() => onToggle(p.id)}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
              selected ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
            } ${locked ? 'cursor-default opacity-70' : ''}`}
          >
            <Avatar name={p.name} photoUrl={p.photo_url} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{p.name}</p>
              <p className="text-xs text-slate-400">{roleLabel(p.role) || 'Role not set'}</p>
            </div>
            {badge && <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>}
            {(selected || locked) && <Check className="h-5 w-5 shrink-0 text-emerald-400" />}
          </button>
        )
      })}
      {players.length === 0 && <p className="text-sm text-slate-400">This team has no players yet.</p>}
    </div>
  )
}

// Captain/wicketkeeper designation. The backend/summary display
// already fully support isCaptain/isWicketkeeper (match_players columns,
// rendered as "(C)"/"(WK)" badges); this was the missing input. Only players
// selected but not yet locked into a saved roster are eligible, since
// match_players has no update path once a row exists — one insert per row.
function CaptainWkPicker({ players, selectedIds, lockedIds, captainId, wicketkeeperId, onCaptainChange, onWicketkeeperChange }) {
  const eligible = players.filter((p) => selectedIds.has(p.id) && !lockedIds.has(p.id))
  if (eligible.length === 0) return null
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-400">Captain</label>
        <select value={captainId} onChange={(e) => onCaptainChange(e.target.value)} className="w-full rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-xs text-white">
          <option value="" className="bg-slate-900">— None —</option>
          {eligible.map((p) => (
            <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-400">Wicketkeeper</label>
        <select value={wicketkeeperId} onChange={(e) => onWicketkeeperChange(e.target.value)} className="w-full rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-xs text-white">
          <option value="" className="bg-slate-900">— None —</option>
          {eligible.map((p) => (
            <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default function MatchRosterPage() {
  const { matchId } = useParams()
  const navigate = useNavigate()

  const [match, setMatch] = useState(null)
  const [teamAPlayers, setTeamAPlayers] = useState([])
  const [teamBPlayers, setTeamBPlayers] = useState([])
  const [matchPlayers, setMatchPlayers] = useState([])
  const [availabilityMap, setAvailabilityMap] = useState(new Map())
  const [selectedA, setSelectedA] = useState(new Set())
  const [selectedB, setSelectedB] = useState(new Set())
  const [captainA, setCaptainA] = useState('')
  const [wicketkeeperA, setWicketkeeperA] = useState('')
  const [captainB, setCaptainB] = useState('')
  const [wicketkeeperB, setWicketkeeperB] = useState('')
  const [tossWinnerId, setTossWinnerId] = useState('')
  const [tossDecision, setTossDecision] = useState('bat')
  const [strikerMpId, setStrikerMpId] = useState('')
  const [nonStrikerMpId, setNonStrikerMpId] = useState('')
  const [bowlerMpId, setBowlerMpId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [innings1State, setInnings1State] = useState(null) // full replayed state, for the break/result views
  const [innings2State, setInnings2State] = useState(null)

  const loadAll = async () => {
    const m = await fetchMatch(matchId)
    setMatch(m)
    const [playersA, playersB, mps, existingInnings] = await Promise.all([
      fetchTeamPlayers(m.team_a_id),
      fetchTeamPlayers(m.team_b_id),
      scoringApi.listMatchPlayers(matchId),
      fetchMatchInnings(matchId),
    ])
    setTeamAPlayers(playersA)
    setTeamBPlayers(playersB)
    setMatchPlayers(mps)
    if (m.status === 'upcoming') {
      fetchMatchAvailability(matchId)
        .then((players) => setAvailabilityMap(new Map(players.map((p) => [p.playerId, p.status]))))
        .catch(() => setAvailabilityMap(new Map()))
    }
    setSelectedA(new Set(mps.filter((mp) => mp.team_id === m.team_a_id).map((mp) => mp.player_id)))
    setSelectedB(new Set(mps.filter((mp) => mp.team_id === m.team_b_id).map((mp) => mp.player_id)))
    if (m.toss_winner_id) setTossWinnerId(String(m.toss_winner_id))
    if (m.toss_decision) setTossDecision(m.toss_decision)

    if (m.status === 'upcoming') {
      setLoaded(true)
      return
    }

    const innings1Row = existingInnings.find((i) => i.innings_number === 1)
    const innings2Row = existingInnings.find((i) => i.innings_number === 2)

    if (m.status === 'live') {
      if (!innings1Row) {
        // Match just started, innings 1 not created yet — fall through to Step 4.
        setLoaded(true)
        return
      }
      if (innings2Row) {
        navigate(`/matches/${matchId}/score?inningsId=${innings2Row.id}`, { replace: true })
        return
      }
      if (innings1Row.status === 'live') {
        navigate(`/matches/${matchId}/score?inningsId=${innings1Row.id}`, { replace: true })
        return
      }
      // innings 1 completed, innings 2 not started yet — this IS the innings break.
      setInnings1State(await scoringApi.getInningsState(innings1Row.id))
      setLoaded(true)
      return
    }

    // 'completed' or 'finalized' — match result view.
    setInnings1State(innings1Row ? await scoringApi.getInningsState(innings1Row.id) : null)
    setInnings2State(innings2Row ? await scoringApi.getInningsState(innings2Row.id) : null)
    setLoaded(true)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadAll is the mount-time data-fetch orchestrator; its setState calls all happen after an await, never synchronously.
    loadAll().catch((err) => setError(err.response?.data?.message || 'Unable to load match.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId])

  if (!loaded || !match) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-emerald-950 text-white">
        {error ? <p className="text-rose-300">{error}</p> : <p className="text-slate-300">Loading match…</p>}
      </main>
    )
  }

  const rosterLockedA = new Set(matchPlayers.filter((mp) => mp.team_id === match.team_a_id).map((mp) => mp.player_id))
  const rosterLockedB = new Set(matchPlayers.filter((mp) => mp.team_id === match.team_b_id).map((mp) => mp.player_id))
  const rosterSaved = matchPlayers.length > 0
  const tossSet = Boolean(match.toss_winner_id && match.toss_decision)

  const toggle = (setFn, set, id) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setFn(next)
  }

  const handleSaveRoster = async () => {
    setError('')
    setBusy(true)
    try {
      const toAdd = [
        ...[...selectedA].filter((id) => !rosterLockedA.has(id)).map((playerId) => ({ teamId: match.team_a_id, playerId, isCaptain: playerId === Number(captainA), isWicketkeeper: playerId === Number(wicketkeeperA) })),
        ...[...selectedB].filter((id) => !rosterLockedB.has(id)).map((playerId) => ({ teamId: match.team_b_id, playerId, isCaptain: playerId === Number(captainB), isWicketkeeper: playerId === Number(wicketkeeperB) })),
      ]
      for (const entry of toAdd) {
        await scoringApi.addMatchPlayer(matchId, { teamId: entry.teamId, playerId: entry.playerId, isPlayingXi: true, isCaptain: entry.isCaptain, isWicketkeeper: entry.isWicketkeeper })
      }
      await loadAll()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save the playing XI.')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveToss = async () => {
    setError('')
    if (!tossWinnerId) return setError('Select who won the toss.')
    setBusy(true)
    try {
      await setTossApi(matchId, { tossWinnerId: Number(tossWinnerId), tossDecision })
      // Reload (not setMatch(result)) — updateMatch() returns the raw matches
      // row without the team-name join fetchMatch()/loadAll() provide, which
      // every team_a_name/team_b_name reference below relies on.
      await loadAll()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save the toss.')
    } finally {
      setBusy(false)
    }
  }

  const handleStart = async () => {
    setError('')
    setBusy(true)
    try {
      await startMatchApi(matchId)
      await loadAll()
    } catch (err) {
      const details = err.response?.data?.details
      // U9 — a soft warning, not a hard block: the backend refuses only
      // because confirmUnderstaffed wasn't sent yet, not because starting
      // is actually disallowed. Ask once, then retry with the real
      // confirmation rather than just showing the raw error.
      if (details?.understaffed) {
        const proceed = window.confirm(
          `Only ${details.filledSlots} of ${details.totalSlots} required umpire slots are filled. Start the match anyway?`,
        )
        if (proceed) {
          try {
            await startMatchApi(matchId, { confirmUnderstaffed: true })
            await loadAll()
          } catch (retryErr) {
            setError(retryErr.response?.data?.message || 'Unable to start the match.')
          }
        }
      } else {
        setError(err.response?.data?.message || 'Unable to start the match.')
      }
    } finally {
      setBusy(false)
    }
  }

  const battingTeamId = battingTeamIdFromToss(match)
  const bowlingTeamId = bowlingTeamIdFromToss(match)
  const battingSquad = matchPlayers.filter((mp) => mp.team_id === battingTeamId)
  const bowlingSquad = matchPlayers.filter((mp) => mp.team_id === bowlingTeamId)

  const handleBeginInnings = async () => {
    setError('')
    if (!strikerMpId || !nonStrikerMpId) return setError('Select both the striker and non-striker.')
    if (strikerMpId === nonStrikerMpId) return setError('Striker and non-striker must be different players.')
    if (!bowlerMpId) return setError('Select the opening bowler.')

    setBusy(true)
    try {
      const innings = await scoringApi.createInnings(matchId, { inningsNumber: 1, battingTeamId, bowlingTeamId })
      await scoringApi.recordEvent(innings.id, { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: Number(strikerMpId) } })
      await scoringApi.recordEvent(innings.id, { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: Number(nonStrikerMpId) } })
      navigate(`/matches/${matchId}/score?inningsId=${innings.id}&openingBowler=${bowlerMpId}`)
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to start the innings.')
    } finally {
      setBusy(false)
    }
  }

  const playersById = new Map(matchPlayers.map((mp) => [mp.id, mp]))
  const battingTeamId2 = innings1State?.innings.bowlingTeamId
  const bowlingTeamId2 = innings1State?.innings.battingTeamId
  const battingSquad2 = matchPlayers.filter((mp) => mp.team_id === battingTeamId2)
  const bowlingSquad2 = matchPlayers.filter((mp) => mp.team_id === bowlingTeamId2)

  const handleStartSecondInnings = async () => {
    setError('')
    if (!strikerMpId || !nonStrikerMpId) return setError('Select both the striker and non-striker.')
    if (strikerMpId === nonStrikerMpId) return setError('Striker and non-striker must be different players.')
    if (!bowlerMpId) return setError('Select the opening bowler.')

    setBusy(true)
    try {
      const innings2 = await scoringApi.createInnings(matchId, { inningsNumber: 2, battingTeamId: battingTeamId2, bowlingTeamId: bowlingTeamId2 })
      await scoringApi.recordEvent(innings2.id, { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: Number(strikerMpId) } })
      await scoringApi.recordEvent(innings2.id, { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: Number(nonStrikerMpId) } })
      navigate(`/matches/${matchId}/score?inningsId=${innings2.id}&openingBowler=${bowlerMpId}`)
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to start the second innings.')
    } finally {
      setBusy(false)
    }
  }

  const handleFinalize = async () => {
    setError('')
    setBusy(true)
    try {
      await finalizeMatchApi(matchId)
      await loadAll()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to finalize the match.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 text-white sm:px-6 lg:px-8"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,0.82), rgba(2,6,23,0.82)), url('/images/cricket-stadium.jpg')` }}
    >
      <div className="mx-auto max-w-4xl">
        <BackButton label="Back to Dashboard" fallback="/player/dashboard" />

        <h1 className="mt-6 text-3xl font-bold text-white">Match Setup</h1>
        <p className="mt-1 text-sm text-slate-300">
          {match.team_a_name} vs {match.team_b_name}
          {match.venue && ` · ${match.venue}`}
        </p>

        {error && <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-rose-300">{error}</div>}

        {/* Step 1: Playing XI */}
        <section className="mt-8 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">1. Playing XI</h2>
            {rosterSaved && <Check className="h-5 w-5 text-emerald-400" />}
          </div>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold text-emerald-300">{match.team_a_name}</p>
              <PlayerCheckboxList players={teamAPlayers} selectedIds={selectedA} disabledIds={rosterLockedA} onToggle={(id) => toggle(setSelectedA, selectedA, id)} availabilityMap={availabilityMap} />
              <CaptainWkPicker
                players={teamAPlayers}
                selectedIds={selectedA}
                lockedIds={rosterLockedA}
                captainId={captainA}
                wicketkeeperId={wicketkeeperA}
                onCaptainChange={setCaptainA}
                onWicketkeeperChange={setWicketkeeperA}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-emerald-300">{match.team_b_name}</p>
              <PlayerCheckboxList players={teamBPlayers} selectedIds={selectedB} disabledIds={rosterLockedB} onToggle={(id) => toggle(setSelectedB, selectedB, id)} availabilityMap={availabilityMap} />
              <CaptainWkPicker
                players={teamBPlayers}
                selectedIds={selectedB}
                lockedIds={rosterLockedB}
                captainId={captainB}
                wicketkeeperId={wicketkeeperB}
                onCaptainChange={setCaptainB}
                onWicketkeeperChange={setWicketkeeperB}
              />
            </div>
          </div>
          <Button disabled={busy} onClick={handleSaveRoster} className="mt-5 h-11 px-5 text-sm">
            Save Playing XI
          </Button>
        </section>

        {/* Step 2: Toss */}
        {rosterSaved && (
          <section className="mt-6 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">2. Toss</h2>
              {tossSet && <Check className="h-5 w-5 text-emerald-400" />}
            </div>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-300">Toss Winner</p>
                <div className="flex gap-2">
                  {[match.team_a_id, match.team_b_id].map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTossWinnerId(String(id))}
                      className={`flex-1 rounded-xl border px-3 py-3 text-sm font-semibold ${
                        tossWinnerId === String(id) ? 'border-emerald-400/60 bg-emerald-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300'
                      }`}
                    >
                      {id === match.team_a_id ? match.team_a_name : match.team_b_name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-300">Elected To</p>
                <div className="flex gap-2">
                  {['bat', 'bowl'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setTossDecision(d)}
                      className={`flex-1 rounded-xl border px-3 py-3 text-sm font-semibold uppercase ${
                        tossDecision === d ? 'border-emerald-400/60 bg-emerald-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Button disabled={busy} onClick={handleSaveToss} className="mt-5 h-11 px-5 text-sm">
              Save Toss
            </Button>
          </section>
        )}

        {/* Step 3: Start Match */}
        {rosterSaved && tossSet && match.status === 'upcoming' && (
          <section className="mt-6 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-6 shadow-sm backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white">3. Start Match</h2>
            <p className="mt-1 text-sm text-emerald-100/80">Playing XI and toss are set. Ready to begin.</p>
            <Button disabled={busy} onClick={handleStart} className="mt-4 h-12 px-6">
              Start Match
            </Button>
          </section>
        )}

        {/* Step 4: Opening batsmen + bowler (innings 1 only — innings 2 has its own section below) */}
        {match.status === 'live' && !innings1State && (
          <section className="mt-6 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white">4. Opening Line-up</h2>
            <p className="mt-1 text-sm text-slate-300">
              {battingTeamId === match.team_a_id ? match.team_a_name : match.team_b_name} bat first.
            </p>

            <div className="mt-4 grid gap-6 sm:grid-cols-3">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-300">Striker</p>
                <select
                  value={strikerMpId}
                  onChange={(e) => setStrikerMpId(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-white"
                >
                  <option value="" className="bg-slate-900">— Select —</option>
                  {battingSquad.map((mp) => (
                    <option key={mp.id} value={mp.id} className="bg-slate-900">{mp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-300">Non-Striker</p>
                <select
                  value={nonStrikerMpId}
                  onChange={(e) => setNonStrikerMpId(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-white"
                >
                  <option value="" className="bg-slate-900">— Select —</option>
                  {battingSquad.map((mp) => (
                    <option key={mp.id} value={mp.id} className="bg-slate-900">{mp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-300">Opening Bowler</p>
                <select
                  value={bowlerMpId}
                  onChange={(e) => setBowlerMpId(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-white"
                >
                  <option value="" className="bg-slate-900">— Select —</option>
                  {bowlingSquad.map((mp) => (
                    <option key={mp.id} value={mp.id} className="bg-slate-900">{mp.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button disabled={busy} onClick={handleBeginInnings} className="mt-5 h-12 px-6">
              Start Scoring
            </Button>
          </section>
        )}

        {/* Innings break: innings 1 done, innings 2 not started */}
        {match.status === 'live' && innings1State && (
          <>
            <section className="mt-6 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
              <h2 className="text-xl font-semibold text-white">Innings Complete</h2>
              <p className="mt-3 text-2xl font-bold text-white">
                {innings1State.innings.battingTeamId === match.team_a_id ? match.team_a_name : match.team_b_name}{' '}
                {innings1State.score.runs}/{innings1State.score.wickets}
              </p>
              <p className="text-sm text-slate-300">
                {formatOvers(innings1State.score.legalBalls, innings1State.format.ballsPerOver)} overs · Extras {inningsExtras(innings1State)}
              </p>
              <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                {topBatters(innings1State, playersById).map((b) => (
                  <p key={b.name}>
                    {b.name}: {b.runs} ({b.balls})
                  </p>
                ))}
                {topBowler(innings1State, playersById) && (
                  <p>
                    {topBowler(innings1State, playersById).name}: {topBowler(innings1State, playersById).wickets}/{topBowler(innings1State, playersById).runs}
                  </p>
                )}
              </div>

              <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Target</p>
                <p className="text-2xl font-bold text-white">{innings1State.score.runs + 1}</p>
                <p className="mt-1 text-sm text-amber-100/80">
                  {battingTeamId2 === match.team_a_id ? match.team_a_name : match.team_b_name} need {innings1State.score.runs + 1} runs to win.
                </p>
              </div>
            </section>

            <section className="mt-6 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
              <h2 className="text-xl font-semibold text-white">Start Second Innings</h2>
              <div className="mt-4 grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-300">Striker</p>
                  <select value={strikerMpId} onChange={(e) => setStrikerMpId(e.target.value)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-white">
                    <option value="" className="bg-slate-900">— Select —</option>
                    {battingSquad2.map((mp) => (
                      <option key={mp.id} value={mp.id} className="bg-slate-900">{mp.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-300">Non-Striker</p>
                  <select value={nonStrikerMpId} onChange={(e) => setNonStrikerMpId(e.target.value)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-white">
                    <option value="" className="bg-slate-900">— Select —</option>
                    {battingSquad2.map((mp) => (
                      <option key={mp.id} value={mp.id} className="bg-slate-900">{mp.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-300">Opening Bowler</p>
                  <select value={bowlerMpId} onChange={(e) => setBowlerMpId(e.target.value)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-white">
                    <option value="" className="bg-slate-900">— Select —</option>
                    {bowlingSquad2.map((mp) => (
                      <option key={mp.id} value={mp.id} className="bg-slate-900">{mp.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Button disabled={busy} onClick={handleStartSecondInnings} className="mt-5 h-12 px-6">
                Start Second Innings
              </Button>
            </section>
          </>
        )}

        {/* Match result: completed or finalized */}
        {(match.status === 'completed' || match.status === 'finalized') && (
          <section className="mt-6 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-6 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Trophy className="h-6 w-6 text-amber-300" />
              <h2 className="text-2xl font-bold text-white">Match Complete</h2>
            </div>
            <p className="mt-2 text-lg font-semibold text-emerald-200">
              {match.winner_team_id ? `${match.winner_team_id === match.team_a_id ? match.team_a_name : match.team_b_name} ${match.result}` : match.result || 'Match tied'}
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[innings1State, innings2State].filter(Boolean).map((inn) => (
                <div key={inn.innings.id} className="rounded-2xl bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">{inn.innings.battingTeamId === match.team_a_id ? match.team_a_name : match.team_b_name}</p>
                  <p className="text-xl font-bold text-white">
                    {inn.score.runs}/{inn.score.wickets}
                  </p>
                  <p className="text-xs text-slate-400">{formatOvers(inn.score.legalBalls, inn.format.ballsPerOver)} overs</p>
                </div>
              ))}
            </div>

            {match.status === 'completed' ? (
              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="text-sm text-emerald-100/80">
                  Finalizing locks the official score from normal scorer edits. Historical corrections are still possible until then.
                </p>
                <Button disabled={busy} onClick={handleFinalize} className="mt-3 h-11 px-5 text-sm from-rose-600 via-rose-500 to-amber-500">
                  Finalize Match
                </Button>
              </div>
            ) : (
              <p className="mt-6 border-t border-white/10 pt-5 text-sm text-slate-300">This match is finalized. The official record is locked.</p>
            )}

            <PostMatchFeedbackPrompt matchId={match.id} />
          </section>
        )}
      </div>
    </main>
  )
}
