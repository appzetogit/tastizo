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
      if (result?.success && result?.idToken) {
        return await signInWithIdToken(result.idToken)
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
          resolve(payload || null)
        }

        if (typeof window.nativeGoogleSignIn === "function") {
          window.nativeGoogleSignIn()
        } else if (window.NativeGoogleSignIn?.postMessage) {
          window.NativeGoogleSignIn.postMessage("nativeGoogleSignIn")
        }
      })

      if (result?.success && result?.idToken) {
        return await signInWithIdToken(result.idToken)
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
