import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { useEffect, Suspense, lazy } from "react"
import Loader from "@food/components/Loader"
import AuthInitializer from "@food/components/AuthInitializer"
import PushSoundEnableButton from "@food/components/PushSoundEnableButton"
import { registerWebPushForCurrentModule } from "@food/utils/firebaseMessaging"
import { isModuleAuthenticated } from "@food/utils/auth"
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications"

// Lazy Loading Components
const UserRouter = lazy(() => import("@food/components/user/UserRouter"))

// Restaurant Module
const RestaurantRouter = lazy(() => import("@food/components/restaurant/RestaurantRouter"))

// Delivery Module
const DeliveryRouter = lazy(() => import("../DeliveryV2"))

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function RestaurantGlobalNotificationListenerInner() {
  useRestaurantNotifications()
  return null
}

function RestaurantGlobalNotificationListener() {
  const location = useLocation()
  const isRestaurantRoute =
    location.pathname.startsWith("/restaurant") &&
    !location.pathname.startsWith("/restaurants")
  const isRestaurantAuthRoute =
    location.pathname === "/restaurant/login" ||
    location.pathname === "/restaurant/auth/sign-in" ||
    location.pathname === "/restaurant/signup" ||
    location.pathname === "/restaurant/signup-email" ||
    location.pathname === "/restaurant/forgot-password" ||
    location.pathname === "/restaurant/otp" ||
    location.pathname === "/restaurant/welcome" ||
    location.pathname === "/restaurant/auth/google-callback"
  const isOrderManagedRoute =
    location.pathname === "/restaurant" ||
    location.pathname === "/restaurant/orders" ||
    location.pathname.startsWith("/restaurant/orders/")

  const shouldListen =
    isRestaurantRoute &&
    !isRestaurantAuthRoute &&
    !isOrderManagedRoute &&
    isModuleAuthenticated("restaurant")

  if (!shouldListen) {
    return null
  }

  return <RestaurantGlobalNotificationListenerInner />
}

export default function App() {
  const location = useLocation()
  const moduleRoot =
    location.pathname.startsWith("/restaurant")
      ? "restaurant"
      : location.pathname.startsWith("/delivery")
        ? "delivery"
        : location.pathname.startsWith("/admin")
          ? "admin"
          : "user"

  useEffect(() => {
    registerWebPushForCurrentModule(`/${moduleRoot}`)
  }, [moduleRoot])

  return (
    <AuthInitializer>
      <>
        <ScrollToTop />
        <RestaurantGlobalNotificationListener />
        <PushSoundEnableButton />
        <Suspense fallback={<Loader />}>
          <Routes>
            {/* Restaurant Module - Already mapped to /restaurant */}
            <Route
              path="restaurant/*"
              element={
                <RestaurantRouter />
              }
            />

            {/* Delivery Module - Already mapped to /delivery */}
            <Route
              path="delivery/*"
              element={<DeliveryRouter />}
            />

            {/* User Module - Explicitly mapped to /user and the catch-all for /food/ and / */}
            {/* NOTE: /user/food is a common mis-navigation - redirect to correct /food/user home */}
            <Route path="user/food" element={<Navigate to="/user" replace />} />
            <Route
              path="user/*"
              element={<UserRouter />}
            />

            {/* Make UserRouter the default for all other paths to handle / and /food/ as user home */}
            <Route path="/*" element={<UserRouter />} />
          </Routes>
        </Suspense>
      </>
    </AuthInitializer>
  )
}
