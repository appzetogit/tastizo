import { createContext, useContext, useRef, useState, useCallback } from "react"

const LocationIconTransitionContext = createContext(null)

export function useLocationIconTransition() {
  const ctx = useContext(LocationIconTransitionContext)
  return ctx
}

export function LocationIconTransitionProvider({ children }) {
  const splashIconRef = useRef(null)
  const navbarIconRef = useRef(null)
  const [splashIconRect, setSplashIconRect] = useState(null)
  const [phase, setPhase] = useState("idle") // idle | splash | transitioning | done

  const registerSplashIconRef = useCallback((el) => {
    splashIconRef.current = el
  }, [])

  const registerNavbarIconRef = useCallback((el) => {
    navbarIconRef.current = el
  }, [])

  const captureSplashIconAndStartExit = useCallback(() => {
    if (splashIconRef.current) {
      const rect = splashIconRef.current.getBoundingClientRect()
      setSplashIconRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      })
      setPhase("transitioning")
    }
  }, [])

  const setPhaseSplash = useCallback(() => setPhase("splash"), [])
  const setPhaseDone = useCallback(() => setPhase("done"), [])

  return (
    <LocationIconTransitionContext.Provider
      value={{
        splashIconRef,
        navbarIconRef,
        registerSplashIconRef,
        registerNavbarIconRef,
        splashIconRect,
        phase,
        setPhaseSplash,
        setPhaseDone,
        captureSplashIconAndStartExit,
      }}
    >
      {children}
    </LocationIconTransitionContext.Provider>
  )
}
