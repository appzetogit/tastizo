import { useState, useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { TbLocation } from "react-icons/tb"
import { ChevronDown } from "lucide-react"
import tastizoLogo from "@/assets/tastizologo.png"
import { locationAPI } from "@/lib/api"
import { useLocationIconTransition } from "@/context/LocationIconTransitionContext"
import { getModuleToken, getUserIdFromToken, isModuleAuthenticated } from "@/lib/utils/auth"
import { getUserLocationOnce } from "@/lib/firebaseRealtime"

const MOBILE_BREAKPOINT = 768
const SPLASH_DURATION_LOGGED_OUT_MS = 2000
const SPLASH_MIN_DISPLAY_LOGGED_IN_MS = 1500
const FADE_OUT_DURATION_MS = 400

// Only show splash on user-facing routes (not admin, restaurant, delivery)
function isUserRoute(pathname) {
  return (
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/restaurant") &&
    !pathname.startsWith("/delivery")
  )
}

async function fetchSplashLocation() {
  if (!navigator.geolocation) return null
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 8000)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        clearTimeout(timeout)
        try {
          const { latitude, longitude } = pos.coords
          const res = await locationAPI.reverseGeocode(latitude, longitude)
          const data = res?.data?.data || {}
          const result = data.results?.[0]
          if (!result) return resolve(null)
          const formatted = result.formatted_address || result.formattedAddress || ""
          const addr = result.address_components || {}
          const building = addr.building || ""
          const area = addr.area || addr.sublocality || addr.neighbourhood || ""
          const city = addr.city || addr.locality || ""
          const road = addr.road || ""
          const shortAddr =
            building || area || road || city || formatted.split(",")[0]?.trim() || "Current Location"
          resolve({ shortAddr, fullAddr: formatted || shortAddr })
        } catch {
          resolve(null)
        }
      },
      () => {
        clearTimeout(timeout)
        resolve(null)
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
    )
  })
}

function formatSplashLocationFromFirebase(userLoc) {
  if (!userLoc) return null
  const formatted = userLoc.formattedAddress || userLoc.address || ""
  const shortAddr =
    userLoc.area || userLoc.city || formatted.split(",")[0]?.trim() || "Current Location"
  return { shortAddr, fullAddr: formatted || shortAddr }
}

export default function MobileSplashScreen() {
  const location = useLocation()
  const { registerSplashIconRef, captureSplashIconAndStartExit, setPhaseSplash } = useLocationIconTransition() || {}
  const [isMobile, setIsMobile] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const [splashLocation, setSplashLocation] = useState(null)
  const [locationLoading, setLocationLoading] = useState(true)
  const showStartedAt = useRef(null)
  const isLoggedIn = isModuleAuthenticated("user")

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Logged out: simple splash, fixed duration
  useEffect(() => {
    if (!isMobile || !isUserRoute(location.pathname) || isLoggedIn) return

    const hideTimer = setTimeout(() => setIsVisible(false), SPLASH_DURATION_LOGGED_OUT_MS)
    return () => clearTimeout(hideTimer)
  }, [isMobile, location.pathname, isLoggedIn])

  // Logged in: splash with location, hide after location fetch + min display time
  useEffect(() => {
    if (!isMobile || !isUserRoute(location.pathname) || !isLoggedIn) return

    if (showStartedAt.current === null) {
      showStartedAt.current = Date.now()
    }

    if (!locationLoading) {
      const elapsed = Date.now() - showStartedAt.current
      const remaining = Math.max(0, SPLASH_MIN_DISPLAY_LOGGED_IN_MS - elapsed)
      const id = setTimeout(() => {
        if (captureSplashIconAndStartExit) captureSplashIconAndStartExit()
        setIsVisible(false)
      }, remaining)
      return () => clearTimeout(id)
    }
  }, [isMobile, location.pathname, isLoggedIn, locationLoading, captureSplashIconAndStartExit])

  // Fetch location only when logged in
  useEffect(() => {
    if (!isMobile || !isUserRoute(location.pathname) || !isLoggedIn) return

    setLocationLoading(true)
    let cancelled = false
    // Watchdog: if Firebase/GPS promise hangs, don't keep the UI stuck on "Detecting location..."
    const watchdogId = setTimeout(() => {
      if (cancelled) return
      setLocationLoading(false)
    }, 12000)

    ;(async () => {
      // 1) Try Firebase (fast, no GPS prompt, no API calls)
      try {
        const token = getModuleToken("user")
        const userId = getUserIdFromToken(token)
        const fbLoc = await Promise.race([
          getUserLocationOnce(userId).catch(() => null),
          new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
        ])
        const formattedFb = formatSplashLocationFromFirebase(fbLoc)
        if (formattedFb) {
          setSplashLocation(formattedFb)
          if (setPhaseSplash) setPhaseSplash()
          setLocationLoading(false)
          return
        }
      } catch {
        // ignore, fall through to GPS
      }

      // 2) Fallback to GPS + backend reverse geocode
      try {
        const loc = await fetchSplashLocation()
        setSplashLocation(loc)
        if (loc && setPhaseSplash) setPhaseSplash()
      } finally {
        if (!cancelled) setLocationLoading(false)
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(watchdogId)
    }
  }, [isMobile, location.pathname, isLoggedIn, setPhaseSplash])

  if (!isMobile || !isUserRoute(location.pathname)) return null

  const handleSplashExit = () => {
    window.dispatchEvent(new CustomEvent("splashEnded"))
  }

  // Logged out: simple splash (logo only). Logged in: splash with location.
  const showLocationSplash = isLoggedIn

  return (
    <AnimatePresence onExitComplete={handleSplashExit}>
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
            className="flex flex-col items-center justify-center gap-6 px-6"
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
            {/* Location block - only for logged-in users */}
            {showLocationSplash && (
              <motion.div
                className="flex flex-col items-center gap-2 text-center max-w-[90vw] min-h-[4rem]"
                initial={{ opacity: 0, y: -8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { delay: 0.1, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
                }}
              >
                <AnimatePresence mode="wait">
                  {locationLoading ? (
                    <motion.span
                      key="detecting"
                      className="text-white/90 text-sm"
                      initial={{ opacity: 0.6, scale: 0.95 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        transition: { duration: 0.3 },
                      }}
                      exit={{
                        opacity: 0,
                        scale: 0.9,
                        y: -8,
                        transition: { duration: 0.25, ease: "easeIn" },
                      }}
                    >
                      Detecting location...
                    </motion.span>
                  ) : splashLocation ? (
                    <motion.div
                      key="location"
                      className="flex flex-col items-center gap-2"
                      initial={{ opacity: 0, scale: 0.9, y: 12 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        y: 0,
                        transition: {
                          duration: 0.4,
                          ease: [0.25, 0.46, 0.45, 0.94],
                          staggerChildren: 0.08,
                        },
                      }}
                    >
                      <motion.div
                        ref={registerSplashIconRef}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.05, duration: 0.3 }}
                      >
                        <TbLocation className="h-4 w-4 text-white flex-shrink-0" />
                      </motion.div>
                      <motion.div
                        className="flex items-center justify-center gap-2"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.3 }}
                      >
                        <p className="text-white font-semibold text-base leading-tight">
                          {splashLocation.shortAddr}
                        </p>
                        <ChevronDown className="h-4 w-4 text-white flex-shrink-0" />
                      </motion.div>
                      <motion.p
                        className="text-white/85 text-xs leading-snug line-clamp-2 max-h-10"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.3 }}
                      >
                        {splashLocation.fullAddr}
                      </motion.p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            )}

            <motion.img
              src={tastizoLogo}
              alt="tastizo"
              className="w-48 max-w-[75vw] h-auto object-contain"
              initial={{ opacity: 0, y: 12 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: {
                  delay: showLocationSplash ? 0.15 : 0.1,
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
