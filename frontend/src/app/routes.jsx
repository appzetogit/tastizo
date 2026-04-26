// Routing file
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { AppShellSkeleton } from '@food/components/ui/loading-skeletons'

const NATIVE_LAST_ROUTE_KEY = 'native_last_route'

// Lazy load the Food service module (Quick-spicy app)
const FoodApp = lazy(() => import('../modules/Food/routes'))
const AuthApp = lazy(() => import('../modules/auth/routes'))
const PageLoader = () => <AppShellSkeleton />

/**
 * FoodAppWrapper — Quick-spicy App. à¤•à¥‹ /food prefix à¤•à¥‡ à¤¸à¤¾à¤¥ render à¤•à¤°à¤¤à¤¾ à¤¹à¥ˆ.
 * 
 * Quick-spicy à¤•à¥€ App.jsx à¤®à¥‡à¤‚ routes /restaurant, /usermain, /admin, /delivery
 * à¤œà¥ˆà¤¸à¥‡ hain (bina /food prefix ke). Yahan hum useLocation se /food ke baad wala
 * path nikalne ke baad FoodApp render karte hain. FoodApp internally BrowserRouter
 * nahi use karta (sirf Routes use karta hai), isliye ye directly kaam karta hai.
 */
const FoodAppWrapper = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <FoodApp />
    </Suspense>
  )
}

const RedirectLegacyFoodRoute = () => {
  const location = useLocation()
  const normalizedPath = location.pathname.replace(/^\/food(?=\/|$)/, '') || '/user'
  return <Navigate to={`${normalizedPath}${location.search}`} replace />
}

// const MasterLandingPage = lazy(() => import('./MasterLandingPage'))
const AdminRouter = lazy(() => import('../modules/Food/components/admin/AdminRouter'))

const AppRoutes = () => {
  const location = useLocation()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const protocol = String(window.location?.protocol || '').toLowerCase()
    const userAgent = String(window.navigator?.userAgent || '').toLowerCase()
    const isNativeLikeShell =
      Boolean(window.flutter_inappwebview) ||
      Boolean(window.ReactNativeWebView) ||
      protocol === 'file:' ||
      userAgent.includes(' wv') ||
      userAgent.includes('; wv')

    if (!isNativeLikeShell) return

    const route = `${location.pathname || ''}${location.search || ''}`
    if (route.startsWith('/food/')) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route.replace(/^\/food/, '') || '/user')
      return
    }

    if (
      route.startsWith('/admin') ||
      route.startsWith('/restaurant') ||
      route.startsWith('/delivery') ||
      route.startsWith('/user')
    ) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <Routes>
      {/* Auth Module */}
      <Route path="/user/auth/*" element={<AuthApp />} />

      {/* Legacy /food URLs redirect to the same page without the prefix */}
      <Route path="/food/*" element={<RedirectLegacyFoodRoute />} />

      {/* Global Admin Portal - AdminRouter handles its own protection for sub-routes */}
      <Route path="/admin/*" element={<AdminRouter />} />

      {/* Handle root and other paths via FoodAppWrapper */}
      <Route path="/*" element={<FoodAppWrapper />} />
    </Routes>
  )
}

export default AppRoutes
