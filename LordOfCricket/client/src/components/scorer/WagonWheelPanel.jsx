import WagonWheel from '../wagon-wheel/WagonWheel.jsx'

export default function WagonWheelPanel({ shots, pendingShot, onSelectShot }) {
  const actions = shots.map((s) => ({ ...s, id: s.deliveryId }))

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Wagon Wheel</p>
      <div className="mx-auto mt-3 aspect-square w-full max-w-md">
        <WagonWheel actions={actions} pendingShot={pendingShot} onSelectShot={onSelectShot} />
      </div>
      <p className="mt-2 text-center text-xs font-semibold text-emerald-300">
        {pendingShot ? `Shot set — will attach to the next delivery` : 'Tap the ground to attach a shot to the next delivery (optional)'}
      </p>
    </div>
  )
}
