import { useEffect } from "react"
import { Navigate } from "react-router-dom"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { registerFcmTokenForDelivery } from "@/lib/notifications/fcmWeb"

export default function ProtectedRoute({ children }) {
  // Check if user is authenticated using proper token validation
  const isAuthenticated = isModuleAuthenticated("delivery")

  useEffect(() => {
    if (isAuthenticated) {
      registerFcmTokenForDelivery()
    }
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return <Navigate to="/delivery/sign-in" replace />
  }

  return children
}

