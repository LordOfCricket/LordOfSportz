// Loading state for the discovery grid. Same shape as
// GroundCard so the layout doesn't jump when real cards replace these.
export default function GroundCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-loc-border bg-loc-surface ">
      <div className="h-44 w-full bg-loc-mint" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-5 w-3/4 rounded bg-loc-border-soft" />
        <div className="h-4 w-1/2 rounded bg-loc-mint" />
        <div className="h-4 w-1/3 rounded bg-loc-mint" />
      </div>
    </div>
  )
}
