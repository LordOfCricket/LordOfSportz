import { useContext } from 'react'
import { MouseParallaxContext } from '../context/mouseParallaxContext.js'

export default function useMouseParallax() {
  const ctx = useContext(MouseParallaxContext)
  if (!ctx) {
    throw new Error('useMouseParallax must be used within MouseParallaxProvider')
  }
  return ctx
}
