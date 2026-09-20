import { useCallback, useState } from 'react'
import { useAuth } from './useAuth.js'

// Phase 6 — drives the step-up challenge modal for any UI action gated by
// one of the 10 step-up scopes (docs/MFA.md). `requestStepUp(actionScope)`
// resolves once step-up is satisfied — immediately if a fresh grant already
// exists, otherwise after the user completes the modal — or rejects if they
// cancel. The actual gated mutation still runs its own real server-side
// step-up consumption inside its own transaction; this only gets the user
// through the challenge UI first.
export function useStepUp() {
  const { startStepUp, completeStepUp } = useAuth()
  const [pending, setPending] = useState(null)

  const requestStepUp = useCallback(
    async (actionScope) => {
      const result = await startStepUp(actionScope)
      if (result.alreadyGranted) return
      return new Promise((resolve, reject) => {
        setPending({ actionScope, challenge: result.challenge, resolve, reject })
      })
    },
    [startStepUp],
  )

  const handleSubmit = async (payload) => {
    if (!pending) return
    await completeStepUp(pending.actionScope, payload)
    pending.resolve()
    setPending(null)
  }

  const handleCancel = () => {
    if (pending) pending.reject(new Error('Step-up verification was cancelled.'))
    setPending(null)
  }

  return { pending, requestStepUp, handleSubmit, handleCancel }
}
