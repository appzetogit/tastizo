import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, X, Bell } from "lucide-react"
import { useRestaurantNotifications } from "../hooks/useRestaurantNotifications"

const NOTIFICATIONS_STORAGE_KEY = "restaurant_notification_list"

function loadStoredNotifications() {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveNotifications(list) {
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(list))
  } catch (e) {
    console.warn("Failed to save notifications", e)
  }
}

export default function Notifications() {
  const navigate = useNavigate()
  const { newOrder, clearNewOrder } = useRestaurantNotifications()
  const [notifications, setNotifications] = useState(loadStoredNotifications)

  // When a new order notification arrives (e.g. from socket), add it to the list
  useEffect(() => {
    if (!newOrder) return
    const id = newOrder.orderId || newOrder._id || `n-${Date.now()}`
    const title = newOrder.orderId ? `New order #${newOrder.orderId}` : "New order"
    const item = {
      id,
      title,
      body: "You have received a new order.",
      createdAt: Date.now(),
      data: newOrder,
    }
    setNotifications((prev) => {
      const next = [item, ...prev.filter((n) => n.id !== id)]
      saveNotifications(next)
      return next
    })
    clearNewOrder()
  }, [newOrder, clearNewOrder])

  const removeNotification = (id) => {
    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id)
      saveNotifications(next)
      return next
    })
  }

  const clearAll = () => {
    setNotifications([])
    saveNotifications([])
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
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
        {notifications.length > 0 && (
          <button
            onClick={clearAll}
            className="text-sm font-medium text-red-600 hover:text-red-700"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex-1 px-4 pt-4 pb-28">
        {notifications.length === 0 ? (
          <div className="text-center text-sm text-gray-600 py-12">
            No notifications
          </div>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li
                key={n.id}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100"
              >
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Bell className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{n.title}</p>
                  {n.body && (
                    <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeNotification(n.id)}
                  className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-700 flex-shrink-0"
                  aria-label="Remove notification"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
