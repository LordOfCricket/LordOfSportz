export default function StatTile({ label, value, emphasis = false, light = false }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        light
          ? `border-loc-border bg-loc-mint ${emphasis ? 'ring-1 ring-loc-green/30' : ''}`
          : `border-white/10 bg-white/5 ${emphasis ? 'ring-1 ring-emerald-400/30' : ''}`
      }`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${light ? 'text-loc-faint' : 'text-slate-400'}`}>{label}</p>
      <p
        className={`mt-1 text-xl font-bold ${
          emphasis ? (light ? 'text-loc-green' : 'text-emerald-300') : light ? 'text-loc-navy' : 'text-white'
        }`}
      >
        {value ?? '—'}
      </p>
    </div>
  )
}
