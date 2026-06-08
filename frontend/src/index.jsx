import { createRoot } from 'react-dom/client'
import App from './app/App.jsx'
import { isModuleAuthenticated } from './modules/Food/utils/auth.js'
import './shared/styles/global.css'

const NATIVE_LAST_ROUTE_KEY = 'native_last_route'

// ─── Quick-spicy Food Module Initialization ───────────────────────────────────

// Load food module business settings (favicon, title) — non-critical
import('./modules/Food/utils/businessSettings.js')
  .then(({ loadBusinessSettings }) => loadBusinessSettings())
  .catch(() => { /* Silently fail — settings load when admin authenticates */ })

// Apply saved theme
const savedTheme = localStorage.getItem('appTheme') || 'light'
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark')
} else {
  document.documentElement.classList.remove('dark')
}

function isNativeLikeShell() {
  if (typeof window === 'undefined') return false

  const protocol = String(window.location?.protocol || '').toLowerCase()
  const userAgent = String(window.navigator?.userAgent || '').toLowerCase()

  return (
    Boolean(window.flutter_inappwebview) ||
    Boolean(window.ReactNativeWebView) ||
    protocol === 'file:' ||
    userAgent.includes(' wv') ||
    userAgent.includes('; wv')
  )
}

function resolveNativeInitialRoute() {
  if (typeof window === 'undefined') return '/user'

  const rawPathname = String(window.location?.pathname || '')
  const pathname = rawPathname.replace(/\/index\.html$/i, '') || '/'
  const storedRoute = String(localStorage.getItem(NATIVE_LAST_ROUTE_KEY) || '').trim()

  if (pathname.startsWith('/food/')) return pathname.replace(/^\/food/, '') || '/user'
  if (pathname.startsWith('/restaurant')) return pathname
  if (pathname.startsWith('/delivery')) return pathname
  if (pathname.startsWith('/user')) return pathname
  if (pathname.startsWith('/admin')) return pathname
  if (storedRoute.startsWith('/food/')) {
    return storedRoute.replace(/^\/food/, '') || '/user'
  }
  if (storedRoute.startsWith('/admin')) {
    return storedRoute
  }

  if (isModuleAuthenticated('restaurant')) return '/restaurant'
  if (isModuleAuthenticated('delivery')) return '/delivery'
  if (isModuleAuthenticated('admin')) return '/admin'
  if (isModuleAuthenticated('user')) return '/user'

  return '/user'
}

function bootstrapNativeHashRoute() {
  if (!isNativeLikeShell() || typeof window === 'undefined') return

  const currentHash = String(window.location?.hash || '')
  if (currentHash.startsWith('#/')) return

  const targetPath = resolveNativeInitialRoute()
  const search = String(window.location?.search || '')
  window.history.replaceState(null, '', `#${targetPath}${search}`)
}

bootstrapNativeHashRoute()

import { toast } from 'sonner'
import React from 'react'

window.alert = (message) => {
  toast.custom((t) => (
    <div className="bg-white dark:bg-[#1a1a1a] p-5 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col gap-3 min-w-[320px] pointer-events-auto">
      <div className="flex gap-3 items-start">
        <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
           <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-gray-900 dark:text-white font-bold text-base mb-1">Message</h3>
          <p className="text-gray-600 dark:text-gray-300 text-sm">{message}</p>
        </div>
      </div>
      <div className="flex justify-end mt-1">
        <button 
          className="px-5 py-2 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-colors shadow-sm"
          onClick={() => toast.dismiss(t)}
        >
          Okay
        </button>
      </div>
    </div>
  ), { duration: 5000, position: 'top-center' })
}

// ─── Suppress known non-critical errors ──────────────────────────────────────

const originalError = console.error
console.error = (...args) => {
  const errorStr = args.join(' ')

  if (typeof args[0] === 'string' && (
    args[0].includes('chrome-extension://') ||
    args[0].includes('_$initialUrl') ||
    args[0].includes('_$onReInit') ||
    args[0].includes('_$bindListeners')
  )) return

  if (
    errorStr.includes('Timeout expired') ||
    errorStr.includes('GeolocationPositionError') ||
    errorStr.includes('Geolocation error') ||
    errorStr.includes('User denied Geolocation') ||
    errorStr.includes('permission denied')
  ) return

  const hasNetworkError = args.some(arg =>
    arg && typeof arg === 'object' &&
    (arg.name === 'AxiosError') &&
    (arg.code === 'ERR_NETWORK' || arg.message === 'Network Error')
  )
  if (hasNetworkError) return

  if (
    errorStr.includes('ðŸŒ Network Error') ||
    errorStr.includes('Network Error - Backend server may not be running') ||
    (errorStr.includes('ERR_NETWORK') && errorStr.includes('AxiosError'))
  ) return

  if (
    errorStr.includes('Restaurant Socket connection error') ||
    errorStr.includes('xhr poll error') ||
    (errorStr.includes('WebSocket connection to') && errorStr.includes('socket.io') && errorStr.includes('failed'))
  ) return

  originalError.apply(console, args)
}

window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason || event
  const errorMsg = error?.message || String(error) || ''
  const errorName = error?.name || ''
  if (
    errorMsg.includes('Timeout expired') ||
    errorMsg.includes('User denied Geolocation') ||
    errorMsg.includes('permission denied') ||
    errorName === 'GeolocationPositionError'
  ) {
    event.preventDefault()
    return
  }
})

// ─────────────────────────────────────────────────────────────────────────────

import { AppProviders } from './app/providers.jsx'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <AppProviders>
    <App />
  </AppProviders>
)
