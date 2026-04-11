import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { TbLocation } from "react-icons/tb"
import { useLocationIconTransition } from "@/context/LocationIconTransitionContext"

const MOBILE_BREAKPOINT = 768
const DURATION_MS = 1600
const ICON_SIZE = 16
const POSITION_EPSILON = 0.5
const LANDING_PULLBACK_PX = 45

const areRectsClose = (a, b) =>
  a &&
  b &&
  Math.abs(a.top - b.top) <= POSITION_EPSILON &&
  Math.abs(a.left - b.left) <= POSITION_EPSILON &&
  Math.abs(a.width - b.width) <= POSITION_EPSILON &&
  Math.abs(a.height - b.height) <= POSITION_EPSILON

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

  // Each new splash->navbar handoff must be allowed to animate (phase was "done" before).
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
    let lastRect = null
    let stableFrames = 0
    // Navbar icon can mount after a small delay during splash->content transition.
    // Keep transitioning alive so the animation can still resolve the target rect.
    const MAX_WAIT_MS = 2500

    const tryResolveTargetRect = () => {
      if (cancelled) return

      const el = navbarIconRef?.current
      if (el) {
        try {
          const rect = el.getBoundingClientRect()
          const nextRect = {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }

          if (areRectsClose(nextRect, lastRect)) {
            stableFrames += 1
          } else {
            stableFrames = 0
            lastRect = nextRect
          }

          if (stableFrames >= 3) {
            setTargetRect(nextRect)
            return
          }
        } catch {
          setPhaseDone()
          return
        }
      }

      if (Date.now() - start > MAX_WAIT_MS) {
        if (lastRect) {
          setTargetRect(lastRect)
        } else {
          setPhaseDone()
        }
        return
      }

      requestAnimationFrame(tryResolveTargetRect)
    }

    tryResolveTargetRect()

    return () => {
      cancelled = true
    }
  }, [phase, navbarIconRef, setPhaseDone])

  useEffect(() => {
    if (!targetRect || !splashIconRect || hasAnimated.current) return
    hasAnimated.current = true
    const sourceCenterX = splashIconRect.left + splashIconRect.width / 2
    const sourceCenterY = splashIconRect.top + splashIconRect.height / 2
    const targetCenterX = targetRect.left + targetRect.width / 2
    const targetCenterY = targetRect.top + targetRect.height / 2
    const rawDeltaX = targetCenterX - sourceCenterX
    const rawDeltaY = targetCenterY - sourceCenterY
    const distance = Math.hypot(rawDeltaX, rawDeltaY)
    const pullback = Math.min(LANDING_PULLBACK_PX, distance)
    const deltaX = distance ? rawDeltaX - (rawDeltaX / distance) * pullback : rawDeltaX
    const deltaY = distance ? rawDeltaY - (rawDeltaY / distance) * pullback : rawDeltaY
    deltaRef.current = { x: deltaX, y: deltaY }

    const el = elRef.current
    if (!el || typeof el.animate !== "function") {
      // Fallback: no WAAPI support, just jump (very rare on modern browsers)
      el && (el.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`)
      setPhaseDone()
      return
    }

    // Direct path to the exact navbar icon location. No side offset, so it cannot leave the screen and snap back.
    const keyframes = [
      { transform: "translate3d(0px, 0px, 0)" },
      { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
    ]

    animRef.current = el.animate(keyframes, {
      duration: DURATION_MS,
      easing: "ease-out",
      fill: "forwards",
    })

    animRef.current.onfinish = () => {
      // Ensure final transform is exact
      el.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
      el.style.opacity = "0"
      setPhaseDone()
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

  const movingWidth = targetRect?.width || splashIconRect?.width || ICON_SIZE
  const movingHeight = targetRect?.height || splashIconRect?.height || ICON_SIZE

  const baseStyle = splashIconRect
    ? {
        position: "fixed",
        top: splashIconRect.top + splashIconRect.height / 2 - movingHeight / 2,
        left: splashIconRect.left + splashIconRect.width / 2 - movingWidth / 2,
        width: movingWidth,
        height: movingHeight,
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
      <TbLocation className="h-full w-full text-white flex-shrink-0" />
    </div>,
    document.body
  )
}
