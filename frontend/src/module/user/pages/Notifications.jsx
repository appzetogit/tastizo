import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Bell, CheckCheck, Clock, Loader2, PackageCheck, Trash2 } from "lucide-react"
import AnimatedPage from "../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { userAPI } from "@/lib/api"
import { useUserNotifications } from "../hooks/useUserNotifications"

function normalizeNotification(notification) {
  const metadata = notification.metadata || {}
  const displayOrderId =
    metadata.orderDisplayId ||
    metadata.orderNumber ||
    metadata.orderId ||
    notification.orderDisplayId ||
    ""

  return {
    ...notification,
    id: notification.id || notification._id,
    createdAt: notification.createdAt || new Date().toISOString(),
    displayOrderId,
    deliveryOtp: metadata.deliveryOtp || "",
  }
}

function formatNotificationTime(value) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000)
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
  } = useUserNotifications()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [markingAll, setMarkingAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadNotifications = async () => {
      try {
        setLoading(true)
        setError("")
        const response = await userAPI.getNotifications({ page: 1, limit: 50 })
        const list = response.data?.data?.notifications || []
        if (mounted) {
          setNotifications(list.map(normalizeNotification))
        }
      } catch (err) {
        console.error("Failed to fetch user notifications:", err)
        if (mounted) setError("Unable to load notifications right now.")
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

    const redirectUrl = notification.redirectUrl || "/user/orders"

    if (!notification.isRead) {
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      )
      setUnreadCount((count) => Math.max(0, count - 1))

      try {
        await userAPI.markNotificationRead(notification.id)
        await refreshUnreadCount()
      } catch (err) {
        console.error("Failed to mark user notification as read:", err)
      }
    }

    navigate(redirectUrl)
  }

  const handleMarkAllRead = async () => {
    try {
      setMarkingAll(true)
      await userAPI.markAllNotificationsRead()
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })))
      await refreshUnreadCount()
    } catch (err) {
      console.error("Failed to mark all user notifications as read:", err)
      setError("Unable to mark all notifications as read.")
    } finally {
      setMarkingAll(false)
    }
  }

  const handleDeleteAll = async () => {
    try {
      setDeletingAll(true)
      setError("")
      await userAPI.deleteAllNotifications()
      setNotifications([])
      setUnreadCount(0)
      await refreshUnreadCount()
    } catch (err) {
      console.error("Failed to delete all user notifications:", err)
      setError("Unable to delete notifications right now.")
    } finally {
      setDeletingAll(false)
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.isRead).length

  return (
    <AnimatedPage className="min-h-screen bg-white dark:bg-[#0a0a0a] max-md:pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <div className="flex items-center gap-3 sm:gap-4 mb-4 md:mb-6 lg:mb-8">
          <Link to="/user">
            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 sm:h-10 sm:w-10">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 flex-1">
            <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 fill-red-600" />
            <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 dark:text-white">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <Badge className="bg-red-600 text-white text-xs md:text-sm">
                {unreadCount}
              </Badge>
            )}
          </div>
          {notifications.length > 0 && (
            <div className="flex items-center gap-1 sm:gap-2">
              {unreadCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllRead}
                  disabled={markingAll || deletingAll}
                  className="text-green-700 hover:text-green-800"
                >
                  {markingAll ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCheck className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline ml-1">Mark all read</span>
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDeleteAll}
                disabled={deletingAll || markingAll}
                className="text-red-600 hover:text-red-700"
              >
                {deletingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="hidden sm:inline ml-1">Delete all</span>
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600 py-12">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading notifications
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12 md:py-16 lg:py-20">
            <Bell className="h-16 w-16 md:h-20 md:w-20 lg:h-24 lg:w-24 text-gray-300 dark:text-gray-600 mx-auto mb-4 md:mb-5 lg:mb-6" />
            <h3 className="text-lg md:text-xl lg:text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-2 md:mb-3">
              No notifications
            </h3>
            <p className="text-sm md:text-base text-gray-500 dark:text-gray-400">
              You're all caught up!
            </p>
          </div>
        ) : (
          <div className="space-y-3 md:space-y-4">
            {notifications.map((notification) => (
              <Card
                key={notification.id || notification.eventKey}
                onClick={() => handleNotificationClick(notification)}
                className={`relative cursor-pointer transition-all duration-200 py-1 hover:shadow-md ${
                  !notification.isRead
                    ? "bg-red-50/50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                }`}
              >
                {!notification.isRead && (
                  <div className="absolute top-2 right-2 w-2.5 h-2.5 md:w-3 md:h-3 bg-red-600 rounded-full" />
                )}

                <CardContent className="p-3 md:p-4 lg:p-5">
                  <div className="flex items-start gap-3 sm:gap-4 md:gap-5">
                    <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center bg-green-100 dark:bg-green-900/40">
                      <PackageCheck className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 text-green-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3
                        className={`text-sm sm:text-base md:text-lg font-semibold mb-1 md:mb-2 ${
                          !notification.isRead
                            ? "text-gray-900 dark:text-white"
                            : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {notification.title || "Order update"}
                      </h3>
                      <p className="text-xs sm:text-sm md:text-base text-gray-600 dark:text-gray-400 mb-2 md:mb-3 line-clamp-2">
                        {notification.message}
                      </p>
                      {notification.displayOrderId && (
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-2">
                          Order ID: {notification.displayOrderId}
                        </p>
                      )}
                      {notification.deliveryOtp && (
                        <p className="text-xs sm:text-sm font-semibold text-green-700 dark:text-green-400 mb-2">
                          OTP: {notification.deliveryOtp}
                        </p>
                      )}
                      <div className="flex items-center gap-1 text-xs md:text-sm text-gray-500 dark:text-gray-400">
                        <Clock className="h-3 w-3 md:h-4 md:w-4" />
                        <span>{formatNotificationTime(notification.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}
