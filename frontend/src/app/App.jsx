import React, { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import AppRoutes from './routes'
import SplashScreen from '@/shared/components/SplashScreen.jsx'

function App() {
  const location = useLocation()
  const [showSplash, setShowSplash] = useState(() => {
    // Check if splash was already shown (persistent)
    const splashShown = localStorage.getItem('tastizo_splash_shown')
    return !splashShown
  })

  const shouldHideSplashForRoute = useMemo(() => {
    const pathname = location.pathname || ''
    return (
      pathname === '/' ||
      pathname === '/food' ||
      pathname.startsWith('/user') ||
      pathname.startsWith('/food/') ||
      pathname.startsWith('/restaurant') ||
      pathname.startsWith('/food/restaurant')
    )
  }, [location.pathname])

  const handleSplashFinish = () => {
    localStorage.setItem('tastizo_splash_shown', 'true')
    setShowSplash(false)
  }

  return (
    <>
      {showSplash && !shouldHideSplashForRoute && <SplashScreen onFinish={handleSplashFinish} />}
      <AppRoutes />
    </>
  )
}

export default App

