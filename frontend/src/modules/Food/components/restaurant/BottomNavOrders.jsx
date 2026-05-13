import { useNavigate, useLocation } from "react-router-dom"
import { useMemo } from "react"
import { motion } from "framer-motion"
import {
  FileText,
  Package,
  MessageSquare,
  Compass,
} from "lucide-react"
import useNotificationInbox from "@food/hooks/useNotificationInbox"
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications"

const getOrdersTabs = (basePath = "/restaurant") => [
  { id: "orders", label: "Orders", icon: FileText, route: `${basePath}/orders` },
  { id: "inventory", label: "Inventory", icon: Package, route: `${basePath}/inventory` },
  { id: "feedback", label: "Feedback", icon: MessageSquare, route: `${basePath}/feedback` },
  { id: "explore", label: "Explore", icon: Compass, route: `${basePath}/explore` },
]

const normalizeRestaurantPathname = (pathname = "") => {
  const value = String(pathname || "").trim()
  if (value.startsWith("/food/restaurant")) {
    const normalized = value.replace(/^\/food\/restaurant/, "/restaurant")
    return normalized || "/restaurant"
  }
  return value || "/restaurant"
}

const findActiveTab = (tabs, pathname) => {
  const normalizedPathname = normalizeRestaurantPathname(pathname)

  if (normalizedPathname === "/restaurant" || normalizedPathname === "/restaurant/orders") {
    return tabs.find((tab) => tab.id === "orders")
  }

  return tabs
    .slice()
    .sort((a, b) => b.route.length - a.route.length)
    .find((tab) => normalizedPathname === tab.route || normalizedPathname.startsWith(tab.route + "/"))
}

export default function BottomNavOrders() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const normalizedPathname = useMemo(() => normalizeRestaurantPathname(pathname), [pathname])
  const basePath = "/restaurant"

  const { unreadCount } = useNotificationInbox("restaurant", { limit: 20, pollMs: 60 * 1000 })
  const { newOrder, newReservation } = useRestaurantNotifications();

  const tabs = useMemo(() => getOrdersTabs(basePath), [basePath])

  const isInternalPage = pathname.includes("/create-offers")
  if (isInternalPage) {
    return null
  }

  const activeTab = useMemo(() => {
    const match = findActiveTab(tabs, normalizedPathname)
    return match?.id || "orders"
  }, [tabs, normalizedPathname])

  const handleTabClick = (tab) => {
    if (tab.route && tab.route !== normalizedPathname) {
      navigate(tab.route)
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] px-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto flex w-full max-w-md items-end gap-2">
        <div className="flex-1 min-w-0">
          <div className="relative overflow-visible rounded-[30px] bg-[#2A9C64] py-2 pl-3 pr-2 shadow-[0_16px_40px_rgba(126,56,102,0.35)]">
            <div className="relative flex items-end justify-around gap-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id

                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => handleTabClick(tab)}
                    aria-current={isActive ? "page" : undefined}
                    className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-visible rounded-full px-2 py-2"
                    whileTap={{ scale: 0.95 }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="bottomNavActive"
                        className="absolute inset-0 -z-10 rounded-full bg-white/20"
                        initial={false}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                    <Icon
                      className={`relative z-10 h-5 w-5 transition-colors duration-300 ease-in-out ${
                        isActive ? "text-white" : "text-white/80"
                      }`}
                    />
                    {/* Notification Dot */}
                    {((tab.id === 'orders' && (newOrder || newReservation)) || 
                      (tab.id === 'feedback' && unreadCount > 0)) && (
                      <span className="absolute top-2 right-1/4 w-2 h-2 rounded-full bg-red-500 border border-[#2A9C64] z-20 animate-pulse" />
                    )}
                    <span
                      className={`relative z-10 whitespace-nowrap text-[11px] leading-none transition-colors duration-300 ease-in-out ${
                        isActive ? "text-white" : "text-white/80"
                      }`}
                    >
                      {tab.label}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
