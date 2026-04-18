import { useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import BottomNavigation from "./BottomNavigation"
import { deliveryAPI } from "@/lib/api"

export default function DeliveryLayout({
  children,
  showGig = false,
  showPocket = false,
  onHomeClick,
  onGigClick
}) {
  const location = useLocation()
  const [requestBadgeCount, setRequestBadgeCount] = useState(0)

  // Update badge count when location changes
  useEffect(() => {
    const refreshBadgeCount = async () => {
      try {
        const response = await deliveryAPI.getUnreadNotificationCount()
        const count = response?.data?.data?.unreadCount ?? response?.data?.unreadCount ?? 0
        setRequestBadgeCount(Number(count) || 0)
      } catch (error) {
        console.warn("Failed to fetch delivery notification badge count:", error?.message || error)
        setRequestBadgeCount(0)
      }
    }

    // Listen for notification updates
    const handleNotificationUpdate = () => {
      refreshBadgeCount()
    }

    refreshBadgeCount()
    window.addEventListener('deliveryNotificationsUpdated', handleNotificationUpdate)

    return () => {
      window.removeEventListener('deliveryNotificationsUpdated', handleNotificationUpdate)
    }
  }, [location.pathname])

  // Pages where bottom navigation should be shown
  const showBottomNav = [
    '/delivery',
    '/delivery/requests',
    '/delivery/trip-history',
    '/delivery/profile'
  ].includes(location.pathname)

  return (
    <>
      <main>
        {children}
      </main>
      {showBottomNav && (
        <BottomNavigation
          showGig={showGig}
          showPocket={showPocket}
          onHomeClick={onHomeClick}
          onGigClick={onGigClick}
          requestBadgeCount={requestBadgeCount}
        />
      )}
    </>
  )
}

