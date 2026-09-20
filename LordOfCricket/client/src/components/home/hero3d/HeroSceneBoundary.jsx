import { Component } from 'react'

/**
 * Catches WebGL context failures or R3F/three.js runtime
 * errors so they can never take down the rest of the homepage. Falls back
 * to rendering nothing: the CSS backdrop Hero already has underneath
 * stands on its own, exactly as it did before this component existed — a
 * failure here must be invisible, not a broken page.
 *
 * A class component is required here: React error boundaries (render-time
 * error catching) have no hook equivalent.
 */
export default class HeroSceneBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      console.error('HeroScene failed, falling back to the plain Hero backdrop:', error)
    }
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}
