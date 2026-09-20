import MfaChallenge from './MfaChallenge.jsx'

// Phase 6 — rendered by any page that uses useStepUp(); `pending` is null
// until a gated action calls requestStepUp(actionScope).
export default function StepUpModal({ pending, onSubmit, onCancel }) {
  if (!pending) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-[28px] border border-white/15 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-2xl">
        <h2 className="text-lg font-bold text-white">Confirm it's you</h2>
        <p className="mt-1 text-sm text-slate-300">This action needs a fresh verification before it can continue.</p>
        <div className="mt-5">
          <MfaChallenge getWebauthnOptions={async () => pending.challenge} onSubmit={onSubmit} hasPasskey={Boolean(pending.challenge)} />
        </div>
        <button type="button" onClick={onCancel} className="mt-4 block w-full text-center text-xs text-slate-400 hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  )
}
