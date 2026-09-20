import { useContext } from 'react'
import { ScrollEnvironmentContext } from '../context/scrollEnvironmentContext.js'

export default function useScrollEnvironment() {
  const ctx = useContext(ScrollEnvironmentContext)
  if (!ctx) {
    throw new Error('useScrollEnvironment must be used within ScrollEnvironmentProvider')
  }
  return ctx
}
