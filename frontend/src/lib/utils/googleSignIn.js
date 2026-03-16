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
  // Check if website is opened inside Flutter InAppWebView
  if (
    typeof window !== "undefined" &&
    window.flutter_inappwebview &&
    typeof window.flutter_inappwebview.callHandler === "function"
  ) {
    try {
      // Call native Google Sign In from Flutter
      const result = await window.flutter_inappwebview.callHandler("nativeGoogleSignIn");

      if (result && result.success && result.idToken) {
        const { GoogleAuthProvider, signInWithCredential } = await import("firebase/auth");
        const credential = GoogleAuthProvider.credential(result.idToken);
        const userCredential = await signInWithCredential(firebaseAuth, credential);
        return userCredential?.user ?? null;
      }
      // User cancelled or error occurred
      return null;
    } catch (e) {
      console.error("Flutter Bridge Error:", e);
      throw e;
    }
  }

  // Normal browser: use Firebase popup
  const { signInWithPopup } = await import("firebase/auth");
  const result = await signInWithPopup(firebaseAuth, googleProvider);
  return result?.user ?? null;
}
