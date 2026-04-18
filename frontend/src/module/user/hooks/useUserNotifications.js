import { useEffect, useRef, useState } from "react"
import io from "socket.io-client"
import { API_BASE_URL } from "@/lib/api/config"
import { authAPI, userAPI } from "@/lib/api"

function getSocketBackendUrl() {
  try {
    const url = new URL(API_BASE_URL)
    url.pathname = url.pathname.replace(/\/api\/?$/, "")
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`.replace(/\/+$/, "")
  } catch {
    return API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/+$/, "")
  }
}

export function useUserNotifications() {
  const socketRef = useRef(null)
  const [userId, setUserId] = useState(null)
  const [latestNotification, setLatestNotification] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadUser = async () => {
      try {
        const response = await authAPI.getCurrentUser()
        const user =
          response.data?.data?.user ||
          response.data?.user ||
          response.data?.data ||
          null
        const id = user?._id || user?.id
        if (!mounted || !id) return

        setUserId(id.toString())

        userAPI.getUnreadNotificationCount()
          .then((countResponse) => {
            if (mounted) {
              setUnreadCount(countResponse.data?.data?.unreadCount || 0)
            }
          })
          .catch((error) => {
            console.warn("Failed to fetch user unread notifications:", error)
          })
      } catch (error) {
        if (error?.response?.status !== 401) {
          console.warn("Unable to initialize user notifications:", error)
        }
      }
    }

    loadUser()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!userId) return undefined

    const backendUrl = getSocketBackendUrl()
    if (!backendUrl || !backendUrl.startsWith("http")) {
      console.warn("Invalid notification socket backend URL:", backendUrl)
      return undefined
    }

    const socket = io(backendUrl, {
      path: "/socket.io/",
      transports: ["polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      auth: {
        token: localStorage.getItem("user_accessToken") || localStorage.getItem("accessToken"),
      },
    })

    socketRef.current = socket

    const joinUserRoom = () => {
      socket.emit("join-user", userId)
    }

    socket.on("connect", () => {
      setIsConnected(true)
      joinUserRoom()
    })

    socket.io.on("reconnect", joinUserRoom)

    socket.on("disconnect", () => {
      setIsConnected(false)
    })

    socket.on("connect_error", (error) => {
      setIsConnected(false)
      console.warn("User notification socket connection failed:", error?.message || error)
    })

    socket.on("user_notification", (notification) => {
      setLatestNotification(notification)
      if (!notification?.isRead) {
        setUnreadCount((count) => count + 1)
      }
    })

    return () => {
      socket.io.off("reconnect", joinUserRoom)
      socket.disconnect()
      socketRef.current = null
    }
  }, [userId])

  const clearLatestNotification = () => {
    setLatestNotification(null)
  }

  const refreshUnreadCount = async () => {
    const response = await userAPI.getUnreadNotificationCount()
    const count = response.data?.data?.unreadCount || 0
    setUnreadCount(count)
    return count
  }

  return {
    latestNotification,
    unreadCount,
    isConnected,
    clearLatestNotification,
    refreshUnreadCount,
    setUnreadCount,
  }
}
