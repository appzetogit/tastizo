const isCallable = (fn) => typeof fn === "function"

const isFlutterShareEnvironment = () =>
  isCallable(window?.flutter_inappwebview?.callHandler) ||
  isCallable(window?.ShareChannel?.postMessage)

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

  // Some browsers reject richer payloads even when basic URL/text sharing works.
  const candidates = [
    payload,
    { title: payload.title, url: payload.url },
    { text: payload.text, url: payload.url },
    { url: payload.url },
    { text: payload.text },
    { title: payload.title, text: payload.text },
  ].filter((candidate) => Object.values(candidate).some(Boolean))

  for (const candidate of candidates) {
    if (isCallable(navigator?.canShare)) {
      try {
        if (!navigator.canShare(candidate)) continue
      } catch {
        // Ignore canShare issues and let navigator.share decide.
      }
    }

    try {
      await navigator.share(candidate)
      return true
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error
      }
    }
  }

  return false
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

  // Preserve the original click/tap activation for browsers by calling
  // Web Share first unless we're clearly inside the Flutter bridge.
  if (!isFlutterShareEnvironment()) {
    try {
      const webShared = await tryWebShare(payload)
      if (webShared) return { method: "web", copied: false }
    } catch (error) {
      if (error?.name === "AbortError") {
        return { method: "cancelled", copied: false }
      }
    }
  }

  try {
    const flutterShared = await tryFlutterShare(payload)
    if (flutterShared) return { method: "flutter", copied: false }
  } catch {
    // Continue to next strategy
  }

  if (isFlutterShareEnvironment()) {
    try {
      const webShared = await tryWebShare(payload)
      if (webShared) return { method: "web", copied: false }
    } catch (error) {
      if (error?.name === "AbortError") {
        return { method: "cancelled", copied: false }
      }
    }
  }

  const copied = await copyText(copyPayload || url || text)
  return { method: copied ? "copy" : "failed", copied }
}

