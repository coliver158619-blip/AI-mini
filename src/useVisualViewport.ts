import { useEffect } from 'react'

// Mobile keyboards can shrink the visual viewport without resizing the layout viewport.
export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport
    const root = document.documentElement
    const update = () => {
      if (viewport && viewport.scale !== 1) return
      root.style.setProperty('--visible-height', `${viewport?.height ?? window.innerHeight}px`)
      root.style.setProperty('--visible-top', `${viewport?.offsetTop ?? 0}px`)
    }
    update()
    window.addEventListener('resize', update)
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      root.style.removeProperty('--visible-height')
      root.style.removeProperty('--visible-top')
    }
  }, [])
}
