// §34 — a lightweight progress indicator across the wizard's 7 sections.
// Purely presentational; step navigation itself lives in the wizard hook.
export default function RegistrationStepper({ steps, currentIndex }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="list" aria-label="Registration steps">
      {steps.map((step, i) => (
        <div key={step} className="flex shrink-0 items-center gap-1.5">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              i < currentIndex
                ? 'bg-emerald-500 text-emerald-950'
                : i === currentIndex
                  ? 'border-2 border-emerald-400 text-emerald-300'
                  : 'border border-emerald-400/20 text-emerald-100/30'
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-xs font-semibold whitespace-nowrap ${i === currentIndex ? 'text-white' : 'text-emerald-100/40'}`}>{step}</span>
          {i < steps.length - 1 && <div className="h-px w-4 shrink-0 bg-emerald-400/20" />}
        </div>
      ))}
    </div>
  )
}
