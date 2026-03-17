import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import { TbLocation } from "react-icons/tb"
import { useLocationIconTransition } from "@/context/LocationIconTransitionContext"

const MOBILE_BREAKPOINT = 768

export default function LocationIconTransition() {
  const ctx = useLocationIconTransition()
  if (!ctx) return null
  const { phase, splashIconRect, navbarIconRef, setPhaseDone } = ctx
  const [targetRect, setTargetRect] = useState(null)
  const [isMobile, setIsMobile] = useState(false)

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
    const updateTarget = () => {
      try {
        if (el) {
          const rect = el.getBoundingClientRect()
          setTargetRect({
            top: rect.top,
            left: rect.left,
            width: Math.max(rect.width, 24),
            height: Math.max(rect.height, 24),
          })
        }
      } catch {
        setPhaseDone()
      }
    }
    updateTarget()
    const raf = requestAnimationFrame(updateTarget)
    let resizeObs = null
    if (typeof ResizeObserver !== "undefined") {
      resizeObs = new ResizeObserver(updateTarget)
      resizeObs.observe(el)
    }
    return () => {
      cancelAnimationFrame(raf)
      resizeObs?.disconnect()
    }
  }, [phase, navbarIconRef, setPhaseDone])

  if (!isMobile || phase === "idle" || phase === "splash" || phase === "done") return null
  if (phase === "transitioning" && !splashIconRect) return null
  if (typeof document === "undefined" || !document.body) return null

  const initialStyle = splashIconRect
    ? {
        position: "fixed",
        top: splashIconRect.top,
        left: splashIconRect.left,
        width: Math.max(splashIconRect.width, 24),
        height: Math.max(splashIconRect.height, 24),
        zIndex: 10000,
        pointerEvents: "none",
      }
    : {}

  const handleComplete = () => {
    setTimeout(() => setPhaseDone(), 0)
  }

  const animateProps = targetRect
    ? {
        top: targetRect.top,
        left: targetRect.left,
        width: targetRect.width,
        height: targetRect.height,
        backgroundColor: "#2B9C64",
        transition: {
          duration: 0.5,
          ease: [0.25, 0.46, 0.45, 0.94],
          onComplete: handleComplete,
        },
      }
    : {
        top: splashIconRect.top,
        left: splashIconRect.left,
        width: initialStyle.width,
        height: initialStyle.height,
      }

  return createPortal(
    <motion.div
      className="flex items-center justify-center rounded-lg"
      style={{
        ...initialStyle,
        backgroundColor: "rgba(255,255,255,0.15)",
      }}
      initial={false}
      animate={animateProps}
    >
      <TbLocation className="h-4 w-4 text-white flex-shrink-0" />
    </motion.div>,
    document.body
  )
}
