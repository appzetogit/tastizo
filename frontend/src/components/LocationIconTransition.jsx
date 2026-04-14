import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { TbLocation } from "react-icons/tb"
import { gsap } from "gsap"
import { useLocationIconTransition } from "@/context/LocationIconTransitionContext"

const MOBILE_BREAKPOINT = 768
const DURATION_MS = 1400
const ICON_SIZE = 16
const POSITION_EPSILON = 0.5
const TARGET_STABLE_FRAMES = 12

const areRectsClose = (a, b) =>
  a &&
  b &&
  Math.abs(a.top - b.top) <= POSITION_EPSILON &&
  Math.abs(a.left - b.left) <= POSITION_EPSILON &&
  Math.abs(a.width - b.width) <= POSITION_EPSILON &&
  Math.abs(a.height - b.height) <= POSITION_EPSILON

const readRect = (el) => {
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

const getCubicBezierPoint = (t, control1X, control1Y, control2X, control2Y, endX, endY) => {
  const inv = 1 - t
  const invSquared = inv * inv
  const tSquared = t * t
  return {
    x:
      3 * invSquared * t * control1X +
      3 * inv * tSquared * control2X +
      tSquared * t * endX,
    y:
      3 * invSquared * t * control1Y +
      3 * inv * tSquared * control2Y +
      tSquared * t * endY,
  }
}

export default function LocationIconTransition() {
  const ctx = useLocationIconTransition()
  if (!ctx) return null

  const { phase, splashIconRect, navbarIconRef, setPhaseDone } = ctx
  const [isMobile, setIsMobile] = useState(false)
  const [canAnimate, setCanAnimate] = useState(false)
  const hasAnimated = useRef(false)
  const elRef = useRef(null)
  const tweenRef = useRef(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    if (phase === "transitioning") {
      hasAnimated.current = false
      setCanAnimate(false)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== "transitioning") return

    const handleSplashEnded = () => setCanAnimate(true)
    window.addEventListener("splashEnded", handleSplashEnded)

    // Fallback in case the event is missed for any reason.
    const fallbackId = setTimeout(() => {
      setCanAnimate(true)
    }, 450)

    return () => {
      window.removeEventListener("splashEnded", handleSplashEnded)
      clearTimeout(fallbackId)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== "transitioning" || !canAnimate || !splashIconRect || hasAnimated.current) return
    hasAnimated.current = true

    const el = elRef.current
    if (!el) {
      setPhaseDone()
      return
    }

    let cancelled = false
    let frameId = null
    const startedAt = Date.now()
    let lastRect = null
    let stableFrames = 0
    const MAX_WAIT_MS = 3000
    const movingWidth = splashIconRect.width || ICON_SIZE
    const movingHeight = splashIconRect.height || ICON_SIZE

    const sourceLeft = splashIconRect.left + splashIconRect.width / 2 - movingWidth / 2
    const sourceTop = splashIconRect.top + splashIconRect.height / 2 - movingHeight / 2

    const startTweenToRect = (finalRect) => {
      if (cancelled || !finalRect) return

      const targetLeft = finalRect.left + finalRect.width / 2 - movingWidth / 2 + 24
      const targetTop = finalRect.top + finalRect.height / 4 - movingHeight / 3 + 34
      const deltaX = targetLeft - sourceLeft
      const deltaY = targetTop - sourceTop
      const phoneLeftEstimate = Math.max(finalRect.left - 18, 0)
      const upperOutsideX = phoneLeftEstimate - sourceLeft - movingWidth - 6
      const lowerOutsideX = upperOutsideX - 8
      const lowerOutsideY = 6
      const upperOutsideY = deltaY

      gsap.killTweensOf(el)
      gsap.set(el, {
        x: 0,
        y: 0,
        opacity: 1,
        force3D: true,
      })

      const pathState = { progress: 0 }
      tweenRef.current = gsap.to(pathState, {
        progress: 1,
        duration: DURATION_MS / 1000,
        ease: "power2.inOut",
        overwrite: true,
        onUpdate: () => {
          // Exact 2-point outside path:
          // A -> lower outside point -> upper outside point -> B.
          const point = getCubicBezierPoint(
            pathState.progress,
            lowerOutsideX,
            lowerOutsideY,
            upperOutsideX,
            upperOutsideY,
            deltaX,
            deltaY,
          )
          gsap.set(el, {
            x: point.x,
            y: point.y,
            force3D: true,
          })
        },
        onComplete: () => {
          gsap.set(el, {
            x: deltaX,
            y: deltaY,
            opacity: 0,
            force3D: true,
          })
          setPhaseDone()
        },
      })
    }

    const resolveAndStart = () => {
      if (cancelled) return

      const nextRect = readRect(navbarIconRef?.current)
      if (nextRect) {
        if (areRectsClose(nextRect, lastRect)) {
          stableFrames += 1
        } else {
          stableFrames = 0
          lastRect = nextRect
        }

        if (stableFrames >= TARGET_STABLE_FRAMES) {
          startTweenToRect(nextRect)
          return
        }
      }

      if (Date.now() - startedAt > MAX_WAIT_MS) {
        if (lastRect) {
          startTweenToRect(lastRect)
        } else {
          setPhaseDone()
        }
        return
      }

      frameId = requestAnimationFrame(resolveAndStart)
    }

    resolveAndStart()

    return () => {
      cancelled = true
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      tweenRef.current?.kill()
      tweenRef.current = null
    }
  }, [phase, canAnimate, splashIconRect, navbarIconRef, setPhaseDone])

  useEffect(() => {
    return () => {
      tweenRef.current?.kill()
      tweenRef.current = null
    }
  }, [])

  if (!isMobile || phase === "idle" || phase === "splash" || phase === "done") return null
  if (phase === "transitioning" && !splashIconRect) return null
  if (typeof document === "undefined" || !document.body) return null

  const movingWidth = splashIconRect?.width || ICON_SIZE
  const movingHeight = splashIconRect?.height || ICON_SIZE

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
    document.body,
  )
}
