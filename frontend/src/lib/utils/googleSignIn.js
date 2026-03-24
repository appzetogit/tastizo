/**
 * Google Sign-In with Flutter InAppWebView compatibility.
 *
 * When the website is opened inside Flutter InAppWebView:
 * - Uses native Google account picker via window.flutter_inappwebview.callHandler('nativeGoogleSignIn')
 * - Authenticates with Firebase using the ID token from Flutter
 *
 * When opened in a normal browser:
 * - Uses standard Firebase signInWithPopup
 *
 * @param {object} firebaseAuth - Firebase Auth instance
 * @param {object} googleProvider - Firebase GoogleAuthProvider instance
 * @returns {Promise<import("firebase/auth").User|null>} Firebase User or null if cancelled
 */
export async function performGoogleSignIn(firebaseAuth, googleProvider) {
  const parsePossibleJson = (value) => {
    if (typeof value !== "string") return value
    const text = value.trim()
    if (!text) return value
    try {
      return JSON.parse(text)
    } catch {
      return value
    }
  }

  const extractIdToken = (payload) => {
    if (!payload) return ""
    if (typeof payload === "string") {
      const parsed = parsePossibleJson(payload)
      if (typeof parsed === "string") {
        // Raw JWT token fallback
        return parsed.split(".").length === 3 ? parsed : ""
      }
      return extractIdToken(parsed)
    }

    const candidate =
      payload.idToken ||
      payload.token ||
      payload.googleIdToken ||
      payload.firebaseIdToken ||
      payload?.data?.idToken ||
      payload?.data?.token ||
      payload?.result?.idToken ||
      payload?.result?.token ||
      ""

    return typeof candidate === "string" ? candidate : ""
  }

  const isSuccessPayload = (payload) => {
    if (!payload) return false
    const parsed = parsePossibleJson(payload)
    if (typeof parsed === "string") {
      return parsed.split(".").length === 3
    }
    if (typeof parsed !== "object") return false

    const hasTopLevelSuccess =
      parsed.success !== undefined || parsed.ok !== undefined || parsed.status !== undefined
    const hasNestedSuccess =
      parsed?.data?.success !== undefined || parsed?.result?.success !== undefined
    const explicitSuccess = hasTopLevelSuccess
      ? parsed.success ?? parsed.ok ?? parsed.status === "success"
      : hasNestedSuccess
        ? parsed?.data?.success ?? parsed?.result?.success
        : undefined

    if (explicitSuccess === false || explicitSuccess === "false") return false
    return !!extractIdToken(parsed)
  }

  const signInWithIdToken = async (idToken) => {
    if (!idToken) return null
    const { GoogleAuthProvider, signInWithCredential } = await import("firebase/auth")
    const credential = GoogleAuthProvider.credential(idToken)
    const userCredential = await signInWithCredential(firebaseAuth, credential)
    return userCredential?.user ?? null
  }

  const isFlutterInAppWebView =
    typeof window !== "undefined" &&
    window.flutter_inappwebview &&
    typeof window.flutter_inappwebview.callHandler === "function"

  if (isFlutterInAppWebView) {
    try {
      const result = await window.flutter_inappwebview.callHandler("nativeGoogleSignIn")
      const parsedResult = parsePossibleJson(result)
      if (isSuccessPayload(parsedResult)) {
        return await signInWithIdToken(extractIdToken(parsedResult))
      }
      return null
    } catch (e) {
      console.error("Flutter InAppWebView bridge error:", e)
    }
  }

  // Support webview_flutter JavaScriptChannel style bridge:
  // Native side can call: window.onNativeGoogleSignInResult({ success, idToken })
  const hasWebviewChannelBridge =
    typeof window !== "undefined" &&
    (typeof window.nativeGoogleSignIn === "function" || window.NativeGoogleSignIn)

  if (hasWebviewChannelBridge) {
    try {
      const result = await new Promise((resolve) => {
        let settled = false
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true
            resolve(null)
          }
        }, 10000)

        window.onNativeGoogleSignInResult = (payload) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          resolve(parsePossibleJson(payload) || null)
        }

        if (typeof window.nativeGoogleSignIn === "function") {
          window.nativeGoogleSignIn()
        } else if (window.NativeGoogleSignIn?.postMessage) {
          // Support both plain command and JSON command formats
          window.NativeGoogleSignIn.postMessage("nativeGoogleSignIn")
        }
      })

      if (isSuccessPayload(result)) {
        return await signInWithIdToken(extractIdToken(result))
      }
      return null
    } catch (e) {
      console.error("Flutter JavaScriptChannel bridge error:", e)
    }
  }

  // Normal browser fallback
  const { signInWithPopup, signInWithRedirect } = await import("firebase/auth")
  try {
    const result = await signInWithPopup(firebaseAuth, googleProvider)
    return result?.user ?? null
  } catch (error) {
    // Popup blocked / unsupported browser: use redirect flow
    if (
      error?.code === "auth/popup-blocked" ||
      error?.code === "auth/operation-not-supported-in-this-environment"
    ) {
      await signInWithRedirect(firebaseAuth, googleProvider)
      return null
    }
    throw error
  }
}

/**
 * Bridge-friendly wrapper for button-based integrations.
 * Mirrors the common `handleGoogleLogin` flow:
 * - Flutter app -> nativeGoogleSignIn handler
 * - Browser -> Firebase popup/redirect fallback
 */
export async function handleGoogleLoginBridge({
  firebaseAuth,
  googleProvider,
  onSuccess,
  onCancel,
  onError,
} = {}) {
  try {
    const user = await performGoogleSignIn(firebaseAuth, googleProvider)
    if (user) {
      if (typeof onSuccess === "function") {
        await onSuccess(user)
      }
      return { success: true, user }
    }
    if (typeof onCancel === "function") {
      onCancel()
    }
    return { success: false, cancelled: true, user: null }
  } catch (error) {
    if (typeof onError === "function") {
      onError(error)
    }
    return { success: false, cancelled: false, error }
  }
}
