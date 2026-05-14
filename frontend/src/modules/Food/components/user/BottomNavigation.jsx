import { Link, useLocation } from "react-router-dom"
import { Tag, User, Truck, UtensilsCrossed } from "lucide-react"
import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import api from "@food/api"

export default function BottomNavigation() {
  const activeGold = "#2A9C64"
  const location = useLocation()
  const pathname = location.pathname
  const [under250PriceLimit, setUnder250PriceLimit] = useState(250)
  const [mounted, setMounted] = useState(false)
  const [isHiddenOnScroll, setIsHiddenOnScroll] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Fetch landing settings to get dynamic price limit
  useEffect(() => {
    let cancelled = false
    api.get('/food/landing/settings/public')
      .then((res) => {
        if (cancelled) return
        const settings = res?.data?.data
        if (settings && typeof settings.under250PriceLimit === 'number') {
          setUnder250PriceLimit(settings.under250PriceLimit)
        }
      })
      .catch(() => {
        if (!cancelled) setUnder250PriceLimit(250)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let lastScrollY = window.scrollY
    let ticking = false

    const updateVisibility = () => {
      const currentScrollY = window.scrollY
      const scrollDelta = currentScrollY - lastScrollY
      const isNearTop = currentScrollY < 24

      if (isNearTop) {
        setIsHiddenOnScroll(false)
      } else if (scrollDelta > 6) {
        setIsHiddenOnScroll(true)
      }

      lastScrollY = currentScrollY
      ticking = false
    }

    const handleScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(updateVisibility)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      window.removeEventListener("scroll", handleScroll)
    }
  }, [])

  // Normalize: strip /food prefix for easier matching
  const normalizedPath = pathname.startsWith("/food")
    ? (pathname.substring(5) || "/")
    : pathname
  const cleanPath = normalizedPath.replace(/\/+$/, "") || "/"

  const isDining = cleanPath === "/dining" || cleanPath === "/user/dining" || cleanPath.startsWith("/user/dining/")
  const isUnder250 = cleanPath === "/under-250" || cleanPath === "/user/under-250" || cleanPath.startsWith("/user/under-250/")
  const isProfile = cleanPath === "/profile" || cleanPath === "/user/profile" || cleanPath.startsWith("/profile/") || cleanPath.startsWith("/user/profile/")
  const isDelivery = !isDining && !isUnder250 && !isProfile && (
    cleanPath === "/" ||
    cleanPath === "" ||
    cleanPath === "/user" ||
    cleanPath.startsWith("/user/") ||
    pathname === "/" ||
    pathname === ""
  )

  if (!mounted || typeof document === "undefined") {
    return null
  }

  return createPortal(
    <div
      className={`mobile-bottom-nav bottom-nav bottom-navigation md:hidden bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 shadow-lg transition-transform duration-300 ease-out ${isHiddenOnScroll ? "translate-y-full pointer-events-none" : "translate-y-0"}`}
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0px)" }}
    >
      <div className="flex items-center justify-around h-auto px-2 sm:px-4">
        {/* Delivery Tab */}
        <Link
          to="/"
          className={`flex flex-1 flex-col items-center gap-1.5 px-2 sm:px-3 py-2 transition-all duration-200 relative ${isDelivery
              ? "text-[#2A9C64]"
              : "text-gray-600 dark:text-gray-400"
            }`}
        >
          <Truck
            className="h-5 w-5"
            strokeWidth={2}
            style={{ color: isDelivery ? activeGold : undefined }}
          />
          <span
            className={`text-xs sm:text-sm font-medium ${isDelivery ? "font-bold" : "text-gray-600 dark:text-gray-400"}`}
            style={isDelivery ? { color: activeGold } : undefined}
          >
            Delivery
          </span>
          {isDelivery && (
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-b-full" style={{ backgroundColor: activeGold }} />
          )}
        </Link>

        {/* Divider */}
        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

        {/* Dining Tab */}
        <Link
          to="/food/user/dining"
          className={`flex flex-1 flex-col items-center gap-1.5 px-2 sm:px-3 py-2 transition-all duration-200 relative ${isDining
              ? "text-[#2A9C64]"
              : "text-gray-600 dark:text-gray-400"
            }`}
        >
          <UtensilsCrossed
            className="h-5 w-5"
            strokeWidth={2}
            style={{ color: isDining ? activeGold : undefined }}
          />
          <span
            className={`text-xs sm:text-sm font-medium ${isDining ? "font-bold" : "text-gray-600 dark:text-gray-400"}`}
            style={isDining ? { color: activeGold } : undefined}
          >
            Dining
          </span>
          {isDining && (
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-b-full" style={{ backgroundColor: activeGold }} />
          )}
        </Link>

        {/* Divider */}
        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

        {/* Under 250 Tab */}
        <Link
          to="/food/user/under-250"
          className={`flex flex-1 flex-col items-center gap-1.5 px-2 sm:px-3 py-2 transition-all duration-200 relative ${isUnder250
              ? "text-[#2A9C64]"
              : "text-gray-600 dark:text-gray-400"
            }`}
        >
          <Tag
            className="h-5 w-5"
            strokeWidth={2}
            style={{ color: isUnder250 ? activeGold : undefined }}
          />
          <span
            className={`text-xs sm:text-sm font-medium ${isUnder250 ? "font-bold" : "text-gray-600 dark:text-gray-400"}`}
            style={isUnder250 ? { color: activeGold } : undefined}
          >
            Under ₹{under250PriceLimit}
          </span>
          {isUnder250 && (
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-b-full" style={{ backgroundColor: activeGold }} />
          )}
        </Link>

        {/* Divider */}
        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

        {/* Profile Tab */}
        <Link
          to="/food/user/profile"
          className={`flex flex-1 flex-col items-center gap-1.5 px-2 sm:px-3 py-2 transition-all duration-200 relative ${isProfile
              ? "text-[#2A9C64]"
              : "text-gray-600 dark:text-gray-400"
            }`}
        >
          <User
            className="h-5 w-5"
            style={{ color: isProfile ? activeGold : undefined }}
          />
          <span
            className={`text-xs sm:text-sm font-medium ${isProfile ? "font-bold" : "text-gray-600 dark:text-gray-400"}`}
            style={isProfile ? { color: activeGold } : undefined}
          >
            Profile
          </span>
          {isProfile && (
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-b-full" style={{ backgroundColor: activeGold }} />
          )}
        </Link>
      </div>
    </div>,
    document.body
  )
}
