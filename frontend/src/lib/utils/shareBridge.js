import { toast } from "sonner"

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

const SHARE_CANCELLED_NAMES = new Set(["AbortError", "NotAllowedError"])

let activeShareRequest = null

const getWindowObject = () => (typeof window !== "undefined" ? window : null)

const getNavigatorObject = () => (typeof navigator !== "undefined" ? navigator : null)

const getDocumentObject = () => (typeof document !== "undefined" ? document : null)

const normalizeShareValue = (value) => {
  if (typeof value !== "string") return ""
  return value.trim()
}

const buildSharePayload = ({ title = "", text = "", url = "" } = {}) => ({
  title: normalizeShareValue(title),
  text: normalizeShareValue(text),
  url: normalizeShareValue(url),
})

const createShareMessage = ({ title = "", text = "", url = "" }) =>
  [title, text, url].filter(Boolean).join("\n")

const getClipboardText = (payload) => {
  if (payload.url) return payload.url
  return createShareMessage(payload)
}

const parseBridgeResult = (value) => {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  if (!trimmed) return value

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

const isBridgeSuccess = (value) => {
  const parsed = parseBridgeResult(value)

  if (parsed == null) return true
  if (parsed === false) return false
  if (parsed === true) return true
  if (typeof parsed === "string") {
    const normalized = parsed.trim().toLowerCase()
    if (!normalized) return true
    if (["false", "error", "failed"].includes(normalized)) return false
    return true
  }

  if (typeof parsed === "object") {
    if (parsed.success === false || parsed.ok === false) return false
    if (typeof parsed.status === "string") {
      const normalizedStatus = parsed.status.toLowerCase()
      if (["error", "failed"].includes(normalizedStatus)) return false
    }
  }

  return true
}

const getFlutterShareChannels = () => {
  const win = getWindowObject()
  if (!win) return []

  return FLUTTER_SHARE_CHANNEL_NAMES.map((name) => win[name]).filter((channel) =>
    isCallable(channel?.postMessage),
  )
}

export const isFlutterShareBridgeAvailable = () => {
  const win = getWindowObject()
  return !!(
    win &&
    (isCallable(win?.flutter_inappwebview?.callHandler) || getFlutterShareChannels().length > 0)
  )
}

export const isFlutterWebView = () => {
  const win = getWindowObject()
  if (!win) return false

  return !!(
    isFlutterShareBridgeAvailable() ||
    win.flutterWebView ||
    win.ReactNativeWebView ||
    win.__flutter_webview__ ||
    win.__TASTIZO_FLUTTER_WEBVIEW__
  )
}

const tryFlutterShare = async (payload) => {
  const win = getWindowObject()
  if (!win) return false

  const message = createShareMessage(payload)

  if (isCallable(win?.flutter_inappwebview?.callHandler)) {
    for (const name of FLUTTER_SHARE_HANDLER_NAMES) {
      const candidates = [
        [name, payload],
        [name, payload.title, payload.text, payload.url],
        [name, message],
      ]

      for (const [handlerName, ...args] of candidates) {
        try {
          const result = await win.flutter_inappwebview.callHandler(handlerName, ...args)
          if (isBridgeSuccess(result)) {
            return true
          }
        } catch {
          // Try the next handler shape.
        }
      }
    }
  }

  const channels = getFlutterShareChannels()
  if (channels.length > 0) {
    const serializedPayload = JSON.stringify({
      ...payload,
      message,
      type: "share",
    })
    channels[0].postMessage(serializedPayload)
    return true
  }

  return false
}

const buildWebShareCandidates = (payload) =>
  [
    payload,
    { title: payload.title, text: payload.text, url: payload.url },
    { title: payload.title, url: payload.url },
    { text: payload.text, url: payload.url },
    { url: payload.url },
    { text: payload.text },
    { title: payload.title, text: payload.text },
    { title: payload.title },
  ]
    .map((candidate) =>
      Object.fromEntries(Object.entries(candidate).filter(([, value]) => Boolean(value))),
    )
    .filter((candidate) => Object.keys(candidate).length > 0)

const tryWebShare = async (payload) => {
  const nav = getNavigatorObject()
  if (!isCallable(nav?.share)) return false

  const candidates = buildWebShareCandidates(payload)

  for (const candidate of candidates) {
    if (isCallable(nav?.canShare)) {
      try {
        if (!nav.canShare(candidate)) {
          continue
        }
      } catch {
        // Some browsers throw for text/url combinations; fall through to share().
      }
    }

    try {
      await nav.share(candidate)
      return true
    } catch (error) {
      if (SHARE_CANCELLED_NAMES.has(error?.name)) {
        throw error
      }
    }
  }

  return false
}

const copyText = async (text) => {
  if (!text) return false

  const nav = getNavigatorObject()
  if (isCallable(nav?.clipboard?.writeText)) {
    try {
      await nav.clipboard.writeText(text)
      return true
    } catch {
      // Fall back to execCommand below.
    }
  }

  const doc = getDocumentObject()
  if (!doc?.body) return false

  try {
    const textArea = doc.createElement("textarea")
    textArea.value = text
    textArea.setAttribute("readonly", "")
    textArea.style.position = "fixed"
    textArea.style.opacity = "0"
    textArea.style.pointerEvents = "none"
    doc.body.appendChild(textArea)
    textArea.select()
    textArea.setSelectionRange(0, text.length)
    const didCopy = doc.execCommand("copy")
    doc.body.removeChild(textArea)
    return !!didCopy
  } catch {
    return false
  }
}

const showCopiedToast = (message) => {
  toast.success(message || "Link copied")
}

const showShareErrorToast = (message) => {
  toast.error(message || "Unable to share right now")
}

export const handleShare = async (
  { title = "", text = "", url = "" },
  {
    copiedMessage = "Link copied",
    errorMessage = "Unable to share right now",
    silent = false,
  } = {},
) => {
  const payload = buildSharePayload({ title, text, url })
  const fallbackText = getClipboardText(payload)

  if (!payload.title && !payload.text && !payload.url) {
    if (!silent) {
      showShareErrorToast(errorMessage)
    }
    return { method: "failed", copied: false, success: false }
  }

  if (activeShareRequest) {
    return { method: "busy", copied: false, success: false }
  }

  activeShareRequest = (async () => {
    if (isFlutterShareBridgeAvailable()) {
      try {
        const flutterShared = await tryFlutterShare(payload)
        if (flutterShared) {
          return { method: "flutter", copied: false, success: true }
        }
      } catch {
        // Fall through to the next supported option.
      }
    }

    try {
      const webShared = await tryWebShare(payload)
      if (webShared) {
        return { method: "web", copied: false, success: true }
      }
    } catch (error) {
      if (SHARE_CANCELLED_NAMES.has(error?.name)) {
        return { method: "cancelled", copied: false, success: false }
      }
    }

    const copied = await copyText(fallbackText)
    if (copied) {
      if (!silent) {
        showCopiedToast(copiedMessage)
      }
      return { method: "copy", copied: true, success: true }
    }

    if (!silent) {
      showShareErrorToast(errorMessage)
    }

    return { method: "failed", copied: false, success: false }
  })()

  try {
    return await activeShareRequest
  } finally {
    activeShareRequest = null
  }
}

export const shareWithFallback = handleShare
