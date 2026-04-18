import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Bell, CheckCheck, Loader2 } from "lucide-react"
import { restaurantAPI } from "@/lib/api"
import { useRestaurantNotifications } from "../hooks/useRestaurantNotifications"

function normalizeNotification(notification) {
  const id = notification.id || notification._id
  return {
    ...notification,
    id,
    createdAt: notification.createdAt || notification.timestamp || new Date().toISOString(),
  }
}

function formatNotificationTime(value) {
  if (!value) return ""

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return "Just now"
  if (diffMinutes < 60) return `${diffMinutes} min ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hr ago`

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  })
}

export default function Notifications() {
  const navigate = useNavigate()
  const {
    latestNotification,
    clearLatestNotification,
    refreshUnreadCount,
    setUnreadCount,
  } = useRestaurantNotifications()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadNotifications = async () => {
      try {
        setLoading(true)
        setError("")
        const response = await restaurantAPI.getNotifications({ page: 1, limit: 50 })
        const list = response.data?.data?.notifications || []
        if (mounted) {
          setNotifications(list.map(normalizeNotification))
        }
      } catch (err) {
        console.error("Failed to fetch restaurant notifications:", err)
        if (mounted) {
          setError("Unable to load notifications right now.")
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadNotifications()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!latestNotification) return

    const incoming = normalizeNotification(latestNotification)
    setNotifications((prev) => {
      const next = prev.filter((item) => {
        if (incoming.id && item.id === incoming.id) return false
        if (incoming.eventKey && item.eventKey === incoming.eventKey) return false
        return true
      })
      return [incoming, ...next]
    })
    clearLatestNotification()
  }, [latestNotification, clearLatestNotification])

  const handleNotificationClick = async (notification) => {
    if (!notification?.id) return

    const redirectUrl = notification.redirectUrl || "/restaurant/notifications"

    if (!notification.isRead) {
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      )
      setUnreadCount((count) => Math.max(0, count - 1))

      try {
        await restaurantAPI.markNotificationRead(notification.id)
        await refreshUnreadCount()
      } catch (err) {
        console.error("Failed to mark restaurant notification as read:", err)
      }
    }

    navigate(redirectUrl)
  }

  const handleMarkAllRead = async () => {
    try {
      setMarkingAll(true)
      await restaurantAPI.markAllNotificationsRead()
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })))
      await refreshUnreadCount()
    } catch (err) {
      console.error("Failed to mark all restaurant notifications as read:", err)
      setError("Unable to mark all notifications as read.")
    } finally {
      setMarkingAll(false)
    }
  }

  const hasUnread = notifications.some((notification) => !notification.isRead)

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/restaurant")}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-900" />
          </button>
          <h1 className="text-base font-semibold text-gray-900">Notifications</h1>
        </div>

        {hasUnread && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 hover:text-green-800 disabled:opacity-60"
          >
            {markingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCheck className="w-4 h-4" />
            )}
            Mark all read
          </button>
        )}
      </div>

      <div className="flex-1 px-4 pt-4 pb-28">
        {error && (
          <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600 py-12">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading notifications
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center text-sm text-gray-600 py-12">
            No notifications yet
          </div>
        ) : (
          <ul className="space-y-2">
            {notifications.map((notification) => (
              <li key={notification.id || notification.eventKey}>
                <button
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                    notification.isRead
                      ? "bg-white border-gray-100 hover:bg-gray-50"
                      : "bg-green-50 border-green-100 hover:bg-green-100/70"
                  }`}
                >
                  <span
                    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      notification.isRead ? "bg-gray-100" : "bg-green-100"
                    }`}
                  >
                    <Bell
                      className={`w-4 h-4 ${
                        notification.isRead ? "text-gray-600" : "text-green-700"
                      }`}
                    />
                  </span>

                  <span className="flex-1 min-w-0">
                    <span className="flex items-start justify-between gap-3">
                      <span className="text-sm font-semibold text-gray-900">
                        {notification.title || "Restaurant notification"}
                      </span>
                      <span className="text-[11px] text-gray-500 whitespace-nowrap">
                        {formatNotificationTime(notification.createdAt)}
                      </span>
                    </span>
                    <span className="block text-xs text-gray-600 mt-0.5">
                      {notification.message}
                    </span>
                  </span>

                  {!notification.isRead && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-green-600 flex-shrink-0" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
