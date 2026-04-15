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
import { readLocalGeocodeCache } from "@/lib/geocodeCache"
import { isUnpersistableLocation } from "@/lib/userLocationDisplay"

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

/** Last known good address when live fetch fails — keeps splash text + handoff animation meaningful. */
function readPreviousSplashLocation() {
  try {
    const raw = localStorage.getItem("userLocation")
    if (raw) {
      const p = JSON.parse(raw)
      if (p && !isUnpersistableLocation(p)) {
        const full = (p.formattedAddress || p.address || "").trim()
        const short =
          (p.area || "").trim() ||
          (p.city || "").trim() ||
          (p.mainTitle || "").trim() ||
          full.split(",")[0]?.trim() ||
          ""
        if (short || full) {
          return { shortAddr: short || "Saved location", fullAddr: full || short }
        }
      }
    }
  } catch {
    // ignore
  }
  try {
    const geo = readLocalGeocodeCache()
    const pr = geo?.parsed
    if (!pr) return null
    const full = (pr.formattedAddress || "").trim()
    const short =
      (pr.area || "").trim() ||
      (pr.city || "").trim() ||
      full.split(",")[0]?.trim() ||
      ""
    if (short || full) return { shortAddr: short || "Saved location", fullAddr: full || short }
  } catch {
    // ignore
  }
  return null
}

export default function MobileSplashScreen() {
  const location = useLocation()
  const { registerSplashIconRef, setPhaseSplash } = useLocationIconTransition() || {}
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
        setIsVisible(false)
      }, remaining)
      return () => clearTimeout(id)
    }
  }, [isMobile, location.pathname, isLoggedIn, locationLoading])

  // Fetch location only when logged in
  useEffect(() => {
    if (!isMobile || !isUserRoute(location.pathname) || !isLoggedIn) return

    let cancelled = false
    const FALLBACK_LOC = { shortAddr: "Current Location", fullAddr: "" }
    const cachedSplash = readPreviousSplashLocation()
    const skipFreshGps = Boolean(cachedSplash)

    // Show saved address + pin icon immediately so LocationIconTransition can capture the ref
    // (while "Detecting…" there is no registerSplashIconRef — animation would skip).
    if (cachedSplash) {
      setSplashLocation(cachedSplash)
      setLocationLoading(false)
      if (setPhaseSplash) setPhaseSplash()
    } else {
      setLocationLoading(true)
    }

    // Hard safety timeout so splash never stays stuck on "Detecting location..."
    const safetyId = setTimeout(() => {
      if (cancelled) return
      const prev = readPreviousSplashLocation()
      setSplashLocation((cur) => cur || prev || FALLBACK_LOC)
      if (setPhaseSplash) setPhaseSplash()
      setLocationLoading(false)
    }, 12000)

    const finish = (loc) => {
      if (cancelled) return
      const prev = readPreviousSplashLocation()
      setSplashLocation(loc || prev || FALLBACK_LOC)
      if (setPhaseSplash) setPhaseSplash()
      setLocationLoading(false)
    }

    ;(async () => {
      // 1) Try Firebase (fast, no GPS prompt, no API calls)
      try {
        const token = getModuleToken("user")
        const userId = getUserIdFromToken(token)
        // Firebase can sometimes hang on slow/unreliable networks.
        // If it doesn't resolve quickly, we must fall back to GPS so splash doesn't get stuck.
        const fbLoc = await Promise.race([
          getUserLocationOnce(userId),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase location timeout")), 4000)),
        ])
        const formattedFb = formatSplashLocationFromFirebase(fbLoc)
        if (formattedFb) {
          clearTimeout(safetyId)
          finish(formattedFb)
          return
        }
      } catch {
        // ignore, fall through to GPS or cache-only exit
      }

      // 2) GPS + backend reverse geocode only when we had nothing usable in storage
      if (skipFreshGps) {
        clearTimeout(safetyId)
        return
      }

      try {
        const loc = await fetchSplashLocation()
        clearTimeout(safetyId)
        finish(loc)
      } catch {
        clearTimeout(safetyId)
        finish(null)
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(safetyId)
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
                  ) : (
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
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.05, duration: 0.3 }}
                      >
                        <span ref={registerSplashIconRef} className="flex h-4 w-4 items-center justify-center flex-shrink-0">
                          <TbLocation className="h-full w-full text-white" />
                        </span>
                      </motion.div>
                      <motion.div
                        className="flex items-center justify-center gap-2"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.3 }}
                      >
                        <p className="text-white font-semibold text-base leading-tight">
                          {splashLocation?.shortAddr || "Current Location"}
                        </p>
                        <ChevronDown className="h-4 w-4 text-white flex-shrink-0" />
                      </motion.div>
                      <motion.p
                        className="text-white/85 text-xs leading-snug line-clamp-2 max-h-10"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.3 }}
                      >
                        {splashLocation?.fullAddr || ""}
                      </motion.p>
                    </motion.div>
                  )}
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
