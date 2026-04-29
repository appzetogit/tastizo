import React, { useState } from 'react'
import AppRoutes from './routes'
import SplashScreen from '@/shared/components/SplashScreen.jsx'

function App() {
  const [showSplash, setShowSplash] = useState(() => {
    // Check if splash was already shown (persistent)
    const splashShown = localStorage.getItem('tastizo_splash_shown')
    return !splashShown
  })
  const handleSplashFinish = () => {
    localStorage.setItem('tastizo_splash_shown', 'true')
    setShowSplash(false)
  }

  return (
    <>
      {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
      <AppRoutes />
    </>
  )
}

export default App

