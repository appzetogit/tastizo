const isCallable = (fn) => typeof fn === "function"

const tryFlutterShare = async (payload) => {
  try {
    if (isCallable(window?.flutter_inappwebview?.callHandler)) {
      const handlers = ["share", "nativeShare", "onShare", "shareContent"]
      for (const name of handlers) {
        try {
          const result = await window.flutter_inappwebview.callHandler(name, payload)
          if (result !== false) {
            return true
          }
        } catch {
          // Try next handler name
        }
      }
    }

    if (isCallable(window?.ShareChannel?.postMessage)) {
      window.ShareChannel.postMessage(JSON.stringify(payload))
      return true
    }
  } catch {
    // Ignore and fallback to browser share/copy
  }
  return false
}

const tryWebShare = async (payload) => {
  if (!isCallable(navigator?.share)) return false
  await navigator.share(payload)
  return true
}

const copyText = async (text) => {
  if (!text) return false
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback below
  }

  try {
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.style.position = "fixed"
    textArea.style.opacity = "0"
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand("copy")
    document.body.removeChild(textArea)
    return true
  } catch {
    return false
  }
}

export const shareWithFallback = async ({ title = "", text = "", url = "" }) => {
  const payload = { title, text, url }
  const copyPayload = [text, url].filter(Boolean).join("\n")

  try {
    const flutterShared = await tryFlutterShare(payload)
    if (flutterShared) return { method: "flutter", copied: false }
  } catch {
    // Continue to next strategy
  }

  try {
    const webShared = await tryWebShare(payload)
    if (webShared) return { method: "web", copied: false }
  } catch (error) {
    if (error?.name === "AbortError") {
      return { method: "cancelled", copied: false }
    }
  }

  const copied = await copyText(copyPayload || url || text)
  return { method: copied ? "copy" : "failed", copied }
}

