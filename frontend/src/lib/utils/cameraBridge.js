// Shared helpers for bridging camera access from Flutter InAppWebView to the web app
// Safely handles environments where the bridge is not available.

/**
 * Convert a base64 string (without data URL prefix) to a File.
 * @param {string} base64 - Base64 encoded string (may or may not include data: prefix).
 * @param {string} filename - Desired file name.
 * @param {string} mimeType - MIME type, e.g. 'image/jpeg'.
 * @returns {File}
 */
export function base64ToFile(base64, filename = "image.jpg", mimeType = "image/jpeg") {
  let raw = base64 || "";
  // Strip data URL prefix if present
  if (raw.includes(",")) {
    raw = raw.split(",")[1];
  }

  const byteCharacters = atob(raw);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType || "image/jpeg" });
  return new File([blob], filename || "image.jpg", { type: blob.type });
}

/**
 * Check if Flutter InAppWebView bridge is available.
 */
export function hasFlutterCameraBridge() {
  return (
    typeof window !== "undefined" &&
    window.flutter_inappwebview &&
    typeof window.flutter_inappwebview.callHandler === "function"
  );
}

/**
 * Open camera (or gallery, depending on options) via Flutter bridge.
 * Returns a File object plus raw bridge response when successful.
 *
 * @param {Object} options
 * @returns {Promise<{ success: boolean, file?: File, raw?: any, error?: any }>}
 */
export async function openCameraViaFlutter(options = {}) {
  if (!hasFlutterCameraBridge()) {
    return { success: false, reason: "no_flutter_bridge" };
  }

  try {
    const payload = {
      source: options.source || "camera",
      accept: options.accept || "image/*",
      multiple: !!options.multiple,
      quality: typeof options.quality === "number" ? options.quality : 0.8,
    };

    const result = await window.flutter_inappwebview.callHandler(
      "openCamera",
      payload,
    );

    if (!result || !result.success) {
      return { success: false, raw: result };
    }

    // If Flutter ever returns a File directly, prefer it.
    if (result.file instanceof File) {
      return { success: true, file: result.file, raw: result };
    }

    if (result.base64) {
      const file = base64ToFile(
        result.base64,
        result.fileName || `image-${Date.now()}.jpg`,
        result.mimeType || "image/jpeg",
      );
      return { success: true, file, raw: result };
    }

    return { success: false, raw: result };
  } catch (error) {
    console.error("[CameraBridge] Failed to open camera via Flutter:", error);
    return { success: false, error };
  }
}

