import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isModuleAuthenticated } from "@/lib/utils/auth";
import { registerFcmTokenForRestaurant } from "@/lib/notifications/fcmWeb";

/**
 * Registers web FCM token for restaurant dashboard on any protected restaurant route.
 * Without this, admin "Send to Restaurant" often finds zero tokens (only a few pages used useRestaurantNotifications before).
 */
function RestaurantFcmBootstrap() {
  useEffect(() => {
    registerFcmTokenForRestaurant().catch(() => {});
  }, []);
  return null;
}

/**
 * Role-based Protected Route Component
 * Only allows access if user is authenticated for the specific module
 */
export default function ProtectedRoute({ children, requiredRole, loginPath }) {
  const location = useLocation();

  // Check if user is authenticated for the required module using module-specific token
  if (!requiredRole) {
    // If no role required, allow access
    return children;
  }

  const isAuthenticated = isModuleAuthenticated(requiredRole);

  // If not authenticated for this module, redirect to login
  if (!isAuthenticated) {
    if (loginPath) {
      return <Navigate to={loginPath} state={{ from: location.pathname }} replace />;
    }

    // Fallback: redirect to appropriate login page
    const roleLoginPaths = {
      'admin': '/admin/login',
      'restaurant': '/restaurant/login',
      'delivery': '/delivery/sign-in',
      'user': '/user/auth/sign-in'
    };

    const redirectPath = roleLoginPaths[requiredRole] || '/';
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <>
      {requiredRole === "restaurant" ? <RestaurantFcmBootstrap /> : null}
      {children}
    </>
  );
}

