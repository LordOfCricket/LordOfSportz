import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { fetchTeams, fetchTeamPlayers } from '../../services/playerApi.js'
import { stageLabel } from '../../models/tournament.model.js'

const inputClass = 'rounded-lg loc-card px-2.5 py-1.5 text-xs text-loc-navy focus:border-loc-green focus:outline-none'
const btnClass = 'rounded-full bg-loc-green px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-loc-green-strong disabled:cursor-not-allowed disabled:opacity-40'
const btnGhostClass = 'rounded-full border border-loc-border px-3 py-1.5 text-xs font-semibold text-loc-muted transition-colors hover:bg-loc-mint disabled:cursor-not-allowed disabled:opacity-40'

/** Staff-only tournament management surface. Every action is
 * server-validated regardless of what this UI allows the organizer to click —
 * this is convenience, not the source of authorization. */
export default function OrganizerPanel({ detail }) {
  const { tournament, teams, squad, fixtures, actionError, openRegistration, registerTeam, removeTeam, addSquadPlayer, removeSquadPlayer, generateFixtures, scheduleFixture, resolveFixture, completeLeague } = detail
  const [allTeams, setAllTeams] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchTeams()
      .then(setAllTeams)
      .catch(() => setAllTeams([]))
  }, [])

  const run = async (fn) => {
    setBusy(true)
    try {
      await fn()
    } catch {
      /* actionError is already surfaced via detail.actionError */
    } finally {
      setBusy(false)
    }
  }

  const unregisteredTeams = allTeams.filter((t) => !teams.some((tt) => tt.teamId === t.id))
  const unscheduledFixtures = fixtures.filter((f) => !f.matchId)
  const awaitingResolution = fixtures.filter((f) => f.awaitingResolution)
  const leagueFixtures = fixtures.filter((f) => f.stage === 'LEAGUE')
  const canCompleteLeague = tournament.format === 'LEAGUE' && leagueFixtures.length > 0 && leagueFixtures.every((f) => f.matchStatus === 'finalized') && tournament.status !== 'COMPLETED'

  return (
    <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-amber-700">
        <Settings className="h-4 w-4" />
        Organizer Tools
      </h2>

      {actionError && <p className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{actionError}</p>}

      {/* Lifecycle */}
      <div className="mt-3 flex flex-wrap gap-2">
        {tournament.status === 'DRAFT' && (
          <button type="button" disabled={busy} onClick={() => run(openRegistration)} className={btnClass}>
            Open Registration
          </button>
        )}
        {tournament.status === 'REGISTRATION' && (
          <button type="button" disabled={busy} onClick={() => run(generateFixtures)} className={btnClass}>
            Generate Fixtures
          </button>
        )}
        {canCompleteLeague && (
          <button type="button" disabled={busy} onClick={() => run(completeLeague)} className={btnClass}>
            Complete Tournament
          </button>
        )}
      </div>

      {/* Team registration */}
      {tournament.status === 'REGISTRATION' && (
        <div className="mt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-loc-muted">Teams ({teams.length}/{tournament.maxTeams})</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select id="register-team-select" className={inputClass} defaultValue="">
              <option value="" disabled>
                Select a team…
              </option>
              {unregisteredTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const select = document.getElementById('register-team-select')
                if (select.value) run(() => registerTeam(Number(select.value)))
              }}
              className={btnGhostClass}
            >
              Register Team
            </button>
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {teams.map((t) => (
              <li key={t.id} className="inline-flex items-center gap-2 rounded-full loc-card px-3 py-1 text-xs text-loc-muted">
                {t.teamName}
                {t.groupName && <span className="text-loc-faint">(Grp {t.groupName})</span>}
                <button type="button" disabled={busy} onClick={() => run(() => removeTeam(t.teamId))} className="text-red-600 hover:text-red-200">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Squad management */}
      {tournament.status === 'REGISTRATION' && teams.length > 0 && (
        <SquadManager teams={teams} squad={squad} onAdd={(teamId, playerId) => run(() => addSquadPlayer(teamId, playerId))} onRemove={(teamId, playerId) => run(() => removeSquadPlayer(teamId, playerId))} busy={busy} />
      )}

      {/* Scheduling */}
      {unscheduledFixtures.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-loc-muted">Schedule Fixtures</h3>
          <div className="mt-2 flex flex-col gap-2">
            {unscheduledFixtures.map((f) => (
              <ScheduleRow key={f.id} fixture={f} busy={busy} onSchedule={(date, venue) => run(() => scheduleFixture(f.id, date, venue))} />
            ))}
          </div>
        </div>
      )}

      {/* Manual tie/no-result resolution */}
      {awaitingResolution.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-amber-700">Tie-Break Resolution Required</h3>
          <div className="mt-2 flex flex-col gap-2">
            {awaitingResolution.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs">
                <span className="text-loc-muted">
                  {stageLabel(f)}: {f.teamA.name} vs {f.teamB.name} ({f.resultType || 'result unresolved'})
                </span>
                <span className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => run(() => resolveFixture(f.id, f.teamA.id))} className={btnGhostClass}>
                    {f.teamA.short || f.teamA.name} Won
                  </button>
                  <button type="button" disabled={busy} onClick={() => run(() => resolveFixture(f.id, f.teamB.id))} className={btnGhostClass}>
                    {f.teamB.short || f.teamB.name} Won
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ScheduleRow({ fixture, busy, onSchedule }) {
  const [date, setDate] = useState('')
  const [venue, setVenue] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg loc-card p-3 text-xs">
      <span className="text-loc-muted">
        {stageLabel(fixture)}: {fixture.teamA.name} vs {fixture.teamB.name}
      </span>
      <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      <input type="text" placeholder="Venue (optional)" value={venue} onChange={(e) => setVenue(e.target.value)} className={inputClass} />
      <button type="button" disabled={busy || !date} onClick={() => onSchedule(new Date(date).toISOString(), venue || undefined)} className={btnGhostClass}>
        Schedule
      </button>
    </div>
  )
}

function SquadManager({ teams, squad, onAdd, onRemove, busy }) {
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.teamId ?? '')
  const [roster, setRoster] = useState([])

  useEffect(() => {
    if (!selectedTeamId) return
    fetchTeamPlayers(selectedTeamId)
      .then(setRoster)
      .catch(() => setRoster([]))
  }, [selectedTeamId])

  const selectedTournamentTeam = teams.find((t) => t.teamId === Number(selectedTeamId))
  const squadForTeam = selectedTournamentTeam ? squad.filter((s) => s.tournamentTeamId === selectedTournamentTeam.id) : []
  const squadPlayerIds = new Set(squad.map((s) => s.playerId))
  const availableRoster = roster.filter((p) => !squadPlayerIds.has(p.id))

  return (
    <div className="mt-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-loc-muted">Squads</h3>
      <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)} className={`${inputClass} mt-2`}>
        {teams.map((t) => (
          <option key={t.teamId} value={t.teamId}>
            {t.teamName}
          </option>
        ))}
      </select>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select id="add-squad-player-select" className={inputClass} defaultValue="">
          <option value="" disabled>
            Add player…
          </option>
          {availableRoster.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const select = document.getElementById('add-squad-player-select')
            if (select.value) onAdd(Number(selectedTeamId), Number(select.value))
          }}
          className={btnGhostClass}
        >
          Add to Squad
        </button>
      </div>

      <ul className="mt-2 flex flex-wrap gap-2">
        {squadForTeam.map((s) => (
          <li key={s.id} className="inline-flex items-center gap-2 rounded-full loc-card px-3 py-1 text-xs text-loc-muted">
            {s.name}
            <button type="button" disabled={busy} onClick={() => onRemove(Number(selectedTeamId), s.playerId)} className="text-red-600 hover:text-red-200">
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
