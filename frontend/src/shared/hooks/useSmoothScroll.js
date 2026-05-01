import { useEffect } from 'react'
import Lenis from 'lenis'

/**
 * Hook to enable smooth scrolling using Lenis.
 * @param {Object} options - Lenis options
 * @param {boolean} enabled - Whether smooth scrolling is enabled
 */
export function useSmoothScroll(options = {}, enabled = true) {
  useEffect(() => {
    if (!enabled) return

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      ...options,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [enabled, JSON.stringify(options)])
}
