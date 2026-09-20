import { Component } from 'react'

// There was previously no error boundary anywhere in the app: an
// uncaught render-time exception (a bad API shape reaching a component that
// doesn't null-check, for example) white-screened the entire site with no
// recovery path. This is the last line of defense, not a substitute for
// per-page loading/error states, which already handle the expected cases.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info)
  }

  handleReload = () => {
    window.location.href = '/'
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-white">
        <h1 className="text-2xl font-bold">Something went wrong.</h1>
        <p className="max-w-sm text-sm text-slate-300">
          This page hit an unexpected error. Your data is safe — try going back to the homepage.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="mt-2 inline-flex items-center justify-center rounded-full bg-linear-to-r from-emerald-400 to-emerald-600 px-6 py-3 text-sm font-bold text-emerald-950 shadow-md shadow-emerald-500/30 transition-all hover:-translate-y-0.5"
        >
          Back to Home
        </button>
      </main>
    )
  }
}
