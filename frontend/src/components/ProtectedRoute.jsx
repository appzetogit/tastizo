import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isModuleAuthenticated } from "@/lib/utils/auth";
import { restaurantAPI } from "@/lib/api";
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
  const isRestaurantRoute = requiredRole === "restaurant";
  const isOnboardingRoute = location.pathname.startsWith("/restaurant/onboarding");
  const [verificationState, setVerificationState] = useState({
    checked: false,
    isActive: true,
    rejectionReason: "",
  });
  const [isReverifyLoading, setIsReverifyLoading] = useState(false);

  useEffect(() => {
    if (!isRestaurantRoute) return;

    let isMounted = true;
    const loadVerificationState = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant();
        const restaurant = response?.data?.data?.restaurant;
        if (!isMounted || !restaurant) return;
        try {
          localStorage.setItem("restaurant_user", JSON.stringify(restaurant));
        } catch {
          // ignore storage failures
        }
        setVerificationState({
          checked: true,
          isActive: !!restaurant.isActive,
          rejectionReason: restaurant.rejectionReason || "",
        });
      } catch {
        if (!isMounted) return;
        setVerificationState((prev) => ({ ...prev, checked: true }));
      }
    };

    loadVerificationState();
    return () => {
      isMounted = false;
    };
  }, [isRestaurantRoute]);

  const shouldShowVerificationPopup = useMemo(() => {
    if (!isRestaurantRoute) return false;
    if (isOnboardingRoute) return false;
    if (!verificationState.checked) return false;
    return verificationState.isActive === false;
  }, [isRestaurantRoute, isOnboardingRoute, verificationState]);

  const handleReverify = async () => {
    try {
      setIsReverifyLoading(true);
      await restaurantAPI.reverify();
      setVerificationState((prev) => ({
        ...prev,
        isActive: false,
        rejectionReason: "",
      }));
    } catch {
      // Keep popup open with current message
    } finally {
      setIsReverifyLoading(false);
    }
  };

  // Check if user is authenticated for the required module using module-specific token
  if (!requiredRole) {
    return children;
  }

  const isAuthenticated = isModuleAuthenticated(requiredRole);

  // If not authenticated for this module, redirect to login
  if (!isAuthenticated) {
    if (loginPath) {
      return <Navigate to={loginPath} state={{ from: location.pathname }} replace />;
    }

    const roleLoginPaths = {
      admin: "/admin/login",
      restaurant: "/restaurant/login",
      delivery: "/delivery/sign-in",
      user: "/user/auth/sign-in",
    };

    const redirectPath = roleLoginPaths[requiredRole] || "/";
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <>
      {requiredRole === "restaurant" ? <RestaurantFcmBootstrap /> : null}
      {!shouldShowVerificationPopup ? children : null}
      {shouldShowVerificationPopup ? (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-5">
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {verificationState.rejectionReason
                ? "Verification Rejected"
                : "Verification Pending"}
            </h3>
            <p className="text-sm text-slate-600">
              {verificationState.rejectionReason
                ? `Admin rejected your restaurant verification. Reason: ${verificationState.rejectionReason}`
                : "Your restaurant is under admin verification. You can complete onboarding, but dashboard actions are locked until approval."}
            </p>
            <div className="mt-4 flex gap-2">
              {verificationState.rejectionReason ? (
                <button
                  type="button"
                  className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-70"
                  onClick={handleReverify}
                  disabled={isReverifyLoading}
                >
                  {isReverifyLoading ? "Submitting..." : "Request Reverify"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

