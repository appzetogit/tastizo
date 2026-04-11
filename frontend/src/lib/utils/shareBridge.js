const isCallable = (fn) => typeof fn === "function"

const FLUTTER_SHARE_CHANNEL_NAMES = [
  "ShareChannel",
  "FlutterShare",
  "NativeShare",
  "Share",
  "shareChannel",
]

const FLUTTER_SHARE_HANDLER_NAMES = [
  "share",
  "nativeShare",
  "onShare",
  "shareContent",
]

const getFlutterShareChannels = () => {
  if (typeof window === "undefined") return []
  return FLUTTER_SHARE_CHANNEL_NAMES.map((name) => window[name]).filter((channel) =>
    isCallable(channel?.postMessage),
  )
}

const isFlutterShareEnvironment = () =>
  typeof window !== "undefined" &&
  (isCallable(window?.flutter_inappwebview?.callHandler) || getFlutterShareChannels().length > 0)

const createShareMessage = ({ title = "", text = "", url = "" }) =>
  [title, text, url].filter(Boolean).join("\n")

const tryFlutterShare = async (payload) => {
  try {
    if (isCallable(window?.flutter_inappwebview?.callHandler)) {
      const message = createShareMessage(payload)
      for (const name of FLUTTER_SHARE_HANDLER_NAMES) {
        try {
          const result = await window.flutter_inappwebview.callHandler(name, payload)
          if (result !== false) {
            return true
          }
        } catch {
          // Try next handler name
        }

        try {
          const result = await window.flutter_inappwebview.callHandler(
            name,
            payload.title,
            payload.text,
            payload.url,
          )
          if (result !== false) {
            return true
          }
        } catch {
          // Try next payload shape
        }

        try {
          const result = await window.flutter_inappwebview.callHandler(name, message)
          if (result !== false) {
            return true
          }
        } catch {
          // Try next handler name
        }
      }
    }

    const channels = getFlutterShareChannels()
    if (channels.length > 0) {
      const message = createShareMessage(payload)
      const serializedPayload = JSON.stringify({ ...payload, message })
      channels[0].postMessage(serializedPayload)
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
  const fallbackText = createShareMessage(payload)

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

  const copied = await copyText(fallbackText)
  if (copied) return { method: "copy", copied: true }

  return { method: "failed", copied: false }
}

