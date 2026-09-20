export default function TeamScore({ name, shortName, logoUrl, runs, wickets, overs }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-emerald-400/20 bg-white/5 text-sm font-bold text-emerald-300">
        {logoUrl ? (
          <img src={logoUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          shortName
        )}
      </div>
      <p className="text-center text-sm font-medium text-emerald-50">{name}</p>
      {runs != null ? (
        <>
          <p className="text-2xl font-bold text-white">
            {runs}
            <span className="text-emerald-400">/{wickets ?? 0}</span>
          </p>
          <p className="text-xs text-emerald-100/50">{overs ?? 0} overs</p>
        </>
      ) : (
        <p className="text-xs text-emerald-100/50">Yet to bat</p>
      )}
    </div>
  )
}
