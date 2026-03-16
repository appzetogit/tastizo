import { useState, useEffect } from "react"
import { useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import tastizoLogo from "@/assets/tastizologo.png"

const MOBILE_BREAKPOINT = 768
const SPLASH_DURATION_MS = 2500
const FADE_OUT_DURATION_MS = 400

// Only show splash on user-facing routes (not admin, restaurant, delivery)
function isUserRoute(pathname) {
  return (
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/restaurant") &&
    !pathname.startsWith("/delivery")
  )
}

export default function MobileSplashScreen() {
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(false)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    if (!isMobile || !isUserRoute(location.pathname)) return

    const hideTimer = setTimeout(() => {
      setIsVisible(false)
    }, SPLASH_DURATION_MS)

    return () => clearTimeout(hideTimer)
  }, [isMobile, location.pathname])

  if (!isMobile || !isUserRoute(location.pathname)) return null

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center md:hidden"
          style={{ backgroundColor: "#2B9C64" }}
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            transition: { duration: FADE_OUT_DURATION_MS / 1000, ease: "easeInOut" },
          }}
        >
          <motion.div
            className="flex flex-col items-center justify-center gap-2 px-6"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{
              opacity: 1,
              scale: 1,
              transition: {
                duration: 0.5,
                ease: [0.25, 0.46, 0.45, 0.94],
              },
            }}
          >
            <motion.img
              src={tastizoLogo}
              alt="tastizo"
              className="w-48 max-w-[75vw] h-auto object-contain"
              initial={{ opacity: 0, y: 12 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: {
                  delay: 0.15,
                  duration: 0.5,
                  ease: [0.25, 0.46, 0.45, 0.94],
                },
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
