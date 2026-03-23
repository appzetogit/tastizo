/**
 * Flutter WebView voice bridges (webview_flutter JavaScriptChannel, flutter_inappwebview).
 * The host app should either:
 * - Expose `window.VoiceSearchChannel.postMessage("startVoiceSearch")` and later invoke
 *   `window.onFlutterVoiceResult(text)` / `window.onFlutterVoiceError(msg)`, or
 * - Use `callHandler('startVoiceSearch')` returning the transcript string.
 */

export function isFlutterVoiceBridgeAvailable() {
  if (typeof window === "undefined") return false
  const ch = window.VoiceSearchChannel
  const inapp = window.flutter_inappwebview
  return (
    (ch && typeof ch.postMessage === "function") ||
    (inapp && typeof inapp.callHandler === "function")
  )
}

export function isWebSpeechRecognitionAvailable() {
  if (typeof window === "undefined") return false
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function isAnyVoiceInputAvailable() {
  return isWebSpeechRecognitionAvailable() || isFlutterVoiceBridgeAvailable()
}

/**
 * Installs global callbacks the Flutter side should invoke (especially for VoiceSearchChannel).
 */
export function setFlutterVoiceGlobals({ onResult, onError }) {
  window.onFlutterVoiceResult = (text) => {
    if (text) {
      onResult(String(text).trim())
    } else {
      onError?.("No speech detected")
    }
  }
  window.onFlutterVoiceError = (errorMsg) => {
    onError?.(errorMsg || "Voice search failed on mobile")
  }
}

/**
 * @returns {'webview_channel' | 'inappwebview' | null}
 */
export function startFlutterVoiceSearch() {
  if (typeof window === "undefined") return null

  if (window.VoiceSearchChannel && typeof window.VoiceSearchChannel.postMessage === "function") {
    window.VoiceSearchChannel.postMessage("startVoiceSearch")
    return "webview_channel"
  }

  if (
    window.flutter_inappwebview &&
    typeof window.flutter_inappwebview.callHandler === "function"
  ) {
    window.flutter_inappwebview
      .callHandler("startVoiceSearch")
      .then((result) => {
        if (result) {
          window.onFlutterVoiceResult?.(result)
        } else {
          window.onFlutterVoiceResult?.("")
        }
      })
      .catch(() => {
        window.onFlutterVoiceError?.("Voice search failed")
      })
    return "inappwebview"
  }

  return null
}

export function stopFlutterVoiceSearch() {
  if (typeof window === "undefined") return
  try {
    if (window.VoiceSearchChannel && typeof window.VoiceSearchChannel.postMessage === "function") {
      window.VoiceSearchChannel.postMessage("stopVoiceSearch")
    }
  } catch {
    /* ignore */
  }
}
