import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { TbLocation } from "react-icons/tb"
import { useLocationIconTransition } from "@/context/LocationIconTransitionContext"

const MOBILE_BREAKPOINT = 768
const DURATION_MS = 950
const WAVE_AMPLITUDE_PX = -100 // strong wave, opposite direction

export default function LocationIconTransition() {
  const ctx = useLocationIconTransition()
  if (!ctx) return null
  const { phase, splashIconRect, navbarIconRef, setPhaseDone } = ctx
  const [targetRect, setTargetRect] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const hasAnimated = useRef(false)
  const deltaRef = useRef(null)
  const elRef = useRef(null)
  const animRef = useRef(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // Each new splash→navbar handoff must be allowed to animate (phase was "done" before).
  useEffect(() => {
    if (phase === "transitioning") {
      hasAnimated.current = false
      setTargetRect(null)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== "transitioning") return
    let cancelled = false
    const start = Date.now()
    // Navbar icon can mount after a small delay during splash->content transition.
    // Keep transitioning alive so the animation can still resolve the target rect.
    const MAX_WAIT_MS = 2500

    const tryResolveTargetRect = () => {
      if (cancelled) return

      const el = navbarIconRef?.current
      if (el) {
        try {
          const rect = el.getBoundingClientRect()
          setTargetRect({
            top: rect.top,
            left: rect.left,
            width: Math.max(rect.width, 24),
            height: Math.max(rect.height, 24),
          })
        } catch {
          setPhaseDone()
        }
        return
      }

      if (Date.now() - start > MAX_WAIT_MS) {
        setPhaseDone()
        return
      }

      setTimeout(tryResolveTargetRect, 50)
    }

    tryResolveTargetRect()

    return () => {
      cancelled = true
    }
  }, [phase, navbarIconRef, setPhaseDone])

  useEffect(() => {
    if (!targetRect || !splashIconRect || hasAnimated.current) return
    hasAnimated.current = true
    const deltaX = targetRect.left - splashIconRect.left
    const deltaY = targetRect.top - splashIconRect.top
    deltaRef.current = { x: deltaX, y: deltaY }

    const el = elRef.current
    if (!el || typeof el.animate !== "function") {
      // Fallback: no WAAPI support, just jump (very rare on modern browsers)
      el && (el.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`)
      setPhaseDone()
      return
    }

    // Compositor-driven keyframe animation (smooth, avoids per-frame JS)
    const len = Math.hypot(deltaX, deltaY) || 1
    const nx = -deltaY / len
    const ny = deltaX / len

    const k = (t, w) => ({
      transform: `translate3d(${deltaX * t + nx * w}px, ${deltaY * t + ny * w}px, 0)`,
    })

    // Multi-keyframe "wave" that dies out before the end to avoid flicker
    const keyframes = [
      k(0, 0),
      k(0.25, WAVE_AMPLITUDE_PX),
      k(0.5, WAVE_AMPLITUDE_PX * -0.6),
      k(0.75, WAVE_AMPLITUDE_PX * 0.35),
      k(0.9, 0),
      k(1, 0),
    ]

    animRef.current = el.animate(keyframes, {
      duration: DURATION_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)", // smooth, slightly ease-out
      fill: "forwards",
    })

    animRef.current.onfinish = () => {
      // Ensure final transform is exact
      el.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
      requestAnimationFrame(() => setPhaseDone())
    }

    return () => {
      try {
        animRef.current?.cancel?.()
      } catch {
        // ignore
      }
      animRef.current = null
    }
  }, [targetRect, splashIconRect, setPhaseDone])

  useEffect(() => {
    return () => {
      try {
        animRef.current?.cancel?.()
      } catch {
        // ignore
      }
      animRef.current = null
    }
  }, [])

  if (!isMobile || phase === "idle" || phase === "splash" || phase === "done") return null
  if (phase === "transitioning" && !splashIconRect) return null
  if (typeof document === "undefined" || !document.body) return null

  const baseStyle = splashIconRect
    ? {
        position: "fixed",
        top: splashIconRect.top,
        left: splashIconRect.left,
        width: Math.max(splashIconRect.width, 24),
        height: Math.max(splashIconRect.height, 24),
        zIndex: 10000,
        pointerEvents: "none",
        transform: "translate3d(0px, 0px, 0)",
        willChange: "transform",
        backfaceVisibility: "hidden",
        transformOrigin: "0 0",
      }
    : {}

  return createPortal(
    <div
      ref={elRef}
      className="flex items-center justify-center rounded-lg"
      style={baseStyle}
    >
      <TbLocation className="h-4 w-4 text-white flex-shrink-0" />
    </div>,
    document.body
  )
}
