import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { TbLocation } from "react-icons/tb"
import { useLocationIconTransition } from "@/context/LocationIconTransitionContext"

const MOBILE_BREAKPOINT = 768
const DURATION_MS = 500

export default function LocationIconTransition() {
  const ctx = useLocationIconTransition()
  if (!ctx) return null
  const { phase, splashIconRect, navbarIconRef, setPhaseDone } = ctx
  const [targetRect, setTargetRect] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const hasAnimated = useRef(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    if (phase !== "transitioning") return
    const el = navbarIconRef?.current
    if (!el) {
      const t = setTimeout(() => setPhaseDone(), 100)
      return () => clearTimeout(t)
    }
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
  }, [phase, navbarIconRef, setPhaseDone])

  // Use native CSS transition - runs on compositor, avoids JS animation loop
  useEffect(() => {
    if (!targetRect || !splashIconRect || hasAnimated.current) return
    hasAnimated.current = true
    const deltaX = targetRect.left - splashIconRect.left
    const deltaY = targetRect.top - splashIconRect.top
    // Force reflow so initial position is painted before we animate
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTranslate({ x: deltaX, y: deltaY })
      })
    })
  }, [targetRect, splashIconRect])

  useEffect(() => {
    if (translate.x === 0 && translate.y === 0) return
    const id = setTimeout(() => setPhaseDone(), DURATION_MS)
    return () => clearTimeout(id)
  }, [translate, setPhaseDone])

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
        transform: `translate3d(${translate.x}px, ${translate.y}px, 0)`,
        transition: `transform ${DURATION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
        willChange: "transform",
      }
    : {}

  return createPortal(
    <div
      className="flex items-center justify-center rounded-lg"
      style={baseStyle}
    >
      <TbLocation className="h-4 w-4 text-white flex-shrink-0" />
    </div>,
    document.body
  )
}
