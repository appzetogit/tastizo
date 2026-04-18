import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Bell, CheckCircle, AlertCircle, Info, Package, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { deliveryAPI } from "@/lib/api"

const NOTIFICATION_RETENTION_MS = 48 * 60 * 60 * 1000

const isRecentNotification = (notification) => {
  const createdAt = new Date(notification?.createdAt || notification?.date || 0)
  if (Number.isNaN(createdAt.getTime())) return false
  return Date.now() - createdAt.getTime() <= NOTIFICATION_RETENTION_MS
}

const getNotificationAppearance = (notification) => {
  const type = String(notification?.type || "").toLowerCase()
  const title = String(notification?.title || "").toLowerCase()

  if (type.includes("delivered") || type.includes("success") || title.includes("delivered") || title.includes("successful")) {
    return { icon: CheckCircle, color: "bg-green-500" }
  }

  if (
    type.includes("pending") ||
    type.includes("cancel") ||
    type.includes("alert") ||
    title.includes("pending") ||
    title.includes("cancel")
  ) {
    return {
      icon: title.includes("cancel") || type.includes("cancel") ? Package : AlertCircle,
      color: title.includes("cancel") || type.includes("cancel") ? "bg-red-500" : "bg-yellow-500",
    }
  }

  if (type.includes("order") || title.includes("order")) {
    return { icon: Package, color: "bg-[#ff8100]" }
  }

  return { icon: Info, color: "bg-blue-500" }
}

const formatRelativeTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(1, Math.floor(diffMs / (60 * 1000)))

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
}

const getDisplayOrderId = (notification) =>
  notification?.metadata?.orderDisplayId ||
  notification?.metadata?.orderNumber ||
  notification?.metadata?.orderId ||
  notification?.orderDisplayId ||
  ""

export default function Notifications() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true)
      setError("")

      const response = await deliveryAPI.getNotifications({ limit: 100 })
      const apiNotifications = response?.data?.data?.notifications || []
      setNotifications(apiNotifications.filter(isRecentNotification))
    } catch (fetchError) {
      console.error("Error fetching delivery notifications:", fetchError)
      setNotifications([])
      setError("Failed to load notifications")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()

    const handleRefresh = () => {
      fetchNotifications()
    }

    window.addEventListener("deliveryNotificationsUpdated", handleRefresh)
    window.addEventListener("deliveryNotificationReceived", handleRefresh)

    return () => {
      window.removeEventListener("deliveryNotificationsUpdated", handleRefresh)
      window.removeEventListener("deliveryNotificationReceived", handleRefresh)
    }
  }, [fetchNotifications])

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  )

  const handleNotificationClick = async (notification) => {
    try {
      if (!notification?.isRead && notification?.id) {
        await deliveryAPI.markNotificationRead(notification.id)
      }
    } catch (markError) {
      console.warn("Failed to mark delivery notification as read:", markError?.message || markError)
    } finally {
      setNotifications((currentNotifications) =>
        currentNotifications.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      )
      window.dispatchEvent(new CustomEvent("deliveryNotificationsUpdated"))

      if (notification?.redirectUrl) {
        navigate(notification.redirectUrl)
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden pb-24 md:pb-6">
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center justify-between rounded-b-3xl md:rounded-b-none sticky top-0 z-10">
        <div className="flex items-center gap-3 md:gap-4">
          <button
            onClick={() => navigate("/delivery")}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg md:text-xl font-bold text-gray-900">Notifications</h1>
        </div>
        {unreadCount > 0 && (
          <span className="bg-[#ff8100] text-white text-xs font-bold px-2.5 py-1 rounded-full">
            {unreadCount} New
          </span>
        )}
      </div>

      <div className="px-4 py-6">
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-10 h-10 text-[#ff8100] mx-auto mb-4 animate-spin" />
            <p className="text-gray-600 text-base">Loading notifications...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-base md:text-lg">{error}</p>
          </div>
        ) : notifications.length > 0 ? (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const { icon: Icon, color } = getNotificationAppearance(notification)

              return (
                <Card
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`bg-white shadow-sm border py-0 border-gray-100 transition-all cursor-pointer ${
                    !notification.isRead ? "border-l-4 border-l-[#ff8100]" : ""
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`${color} p-2 rounded-full flex-shrink-0`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3
                            className={`font-semibold text-sm md:text-base ${
                              !notification.isRead ? "text-gray-900" : "text-gray-700"
                            }`}
                          >
                            {notification.title}
                          </h3>
                          {!notification.isRead && (
                            <div className="w-2 h-2 bg-[#ff8100] rounded-full flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-gray-600 text-sm md:text-base mb-2 leading-relaxed">
                          {notification.message}
                        </p>
                        {getDisplayOrderId(notification) && (
                          <p className="text-gray-500 text-xs md:text-sm mb-2">
                            Order ID: {getDisplayOrderId(notification)}
                          </p>
                        )}
                        <p className="text-gray-400 text-xs">
                          {formatRelativeTime(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-base md:text-lg">No notifications</p>
          </div>
        )}
      </div>
    </div>
  )
}
