function strikeRate(runs, balls) {
  return balls > 0 ? ((runs / balls) * 100).toFixed(1) : '0.0'
}

function BatsmanRow({ name, stat, isStriker }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5">
      <span className="text-sm font-semibold text-white">
        {name} {isStriker && <span className="text-emerald-400">*</span>}
      </span>
      <span className="text-sm text-slate-300">
        {stat?.runs ?? 0} ({stat?.balls ?? 0}) · {stat?.fours ?? 0}x4 {stat?.sixes ?? 0}x6 · SR {strikeRate(stat?.runs ?? 0, stat?.balls ?? 0)}
      </span>
    </div>
  )
}

export default function BatsmenPanel({ state, playersById }) {
  const striker = playersById.get(state.striker)
  const nonStriker = playersById.get(state.nonStriker)

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Batsmen</p>
      <div className="mt-3 space-y-2">
        {striker && <BatsmanRow name={striker.name} stat={state.batsmen[state.striker]} isStriker />}
        {nonStriker && <BatsmanRow name={nonStriker.name} stat={state.batsmen[state.nonStriker]} isStriker={false} />}
        {!striker && !nonStriker && <p className="text-sm text-slate-400">Waiting for batsmen to be selected.</p>}
      </div>
    </div>
  )
}
