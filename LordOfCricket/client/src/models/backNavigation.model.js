// Pure decision logic for BackButton (components/common/BackButton.jsx) —
// separated out so it's unit-testable without a DOM/component-render
// harness (none exists in this repo). React Router v7's data router
// (createBrowserRouter) stamps its own navigation-stack index into
// `history.state.idx`, incremented only on router-driven pushes — a
// reliable "has this SPA session navigated at least once" signal, unlike
// raw `history.length` (which counts the browser tab's ENTIRE history,
// including pages outside LOC entirely — a high length proves nothing
// about whether the previous entry is actually one of our own routes).
export function hasMeaningfulHistory(historyState) {
  const idx = historyState?.idx
  return typeof idx === 'number' && idx > 0
}
