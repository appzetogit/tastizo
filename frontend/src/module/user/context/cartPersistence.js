const GUEST_SESSION_STORAGE_KEY = "cart_guest_session_v1"
const GUEST_CART_STORAGE_KEY = "cart_guest_state_v1"
const AUTH_CART_CACHE_PREFIX = "cart_auth_cache_v1"
const MERGED_GUEST_SESSION_PREFIX = "cart_guest_merged_v1"

function getLocalStorage() {
  if (typeof window === "undefined") return null
  return window.localStorage || null
}

function getSessionStorage() {
  if (typeof window === "undefined") return null
  return window.sessionStorage || null
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function stableStringify(value) {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`
  }
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function normalizeAddonList(addons = []) {
  if (!Array.isArray(addons)) return []
  return addons
    .map((addon) => ({
      addonId: String(addon?.addonId ?? addon?.id ?? addon?._id ?? "").trim(),
      optionId: String(addon?.optionId ?? addon?.valueId ?? addon?.selectedOptionId ?? "").trim(),
      name: addon?.name || "",
      optionName: addon?.optionName || addon?.value || "",
      price: normalizeNumber(addon?.price, 0),
      quantity: Math.max(1, normalizeNumber(addon?.quantity, 1)),
    }))
    .filter((addon) => addon.addonId || addon.name)
    .sort((left, right) =>
      stableStringify(left).localeCompare(stableStringify(right)),
    )
}

export function buildCartLineKey(item = {}) {
  const baseId = String(item?.itemId ?? item?.id ?? "").trim()
  const variationId = String(item?.selectedVariation?.variationId ?? "").trim()
  const addonKey = stableStringify(
    normalizeAddonList(item?.selectedAddons || item?.addons || item?.addOns || []),
  )
  const customizationKey = stableStringify(item?.customizations || item?.customization || null)
  const instructions = String(
    item?.specialInstructions || item?.instructions || item?.note || "",
  )
    .trim()
    .toLowerCase()

  return [
    baseId,
    variationId,
    addonKey,
    customizationKey,
    instructions,
  ].join("::")
}

export function sanitizeCartItem(item = {}, fallback = {}) {
  const id = String(item?.itemId ?? item?.id ?? "").trim()
  if (!id) {
    throw new Error("Cart item is missing an item id.")
  }

  const restaurantId = String(
    item?.restaurantId ??
      item?.restaurant?._id ??
      item?.restaurant?.id ??
      item?.restaurant?.restaurantId ??
      fallback.restaurantId ??
      "",
  ).trim()

  const restaurantName =
    item?.restaurantName ||
    item?.restaurant ||
    fallback.restaurantName ||
    ""

  if (!restaurantId && !restaurantName) {
    throw new Error("Cart item is missing restaurant information.")
  }

  const quantity = Math.max(1, Math.round(normalizeNumber(item?.quantity, 1)))
  const selectedVariation = item?.selectedVariation
    ? {
        variationId: String(item.selectedVariation.variationId || "").trim(),
        variationName: item.selectedVariation.variationName || "",
        price: normalizeNumber(
          item.selectedVariation.price,
          normalizeNumber(item?.price, 0),
        ),
      }
    : null

  return {
    id,
    itemId: id,
    name: item?.name || "",
    price: normalizeNumber(item?.price, selectedVariation?.price || 0),
    quantity,
    image: item?.image || item?.imageUrl || "",
    restaurant: restaurantName,
    restaurantId: restaurantId || null,
    description: item?.description || "",
    originalPrice: normalizeNumber(
      item?.originalPrice,
      normalizeNumber(item?.price, 0),
    ),
    isVeg: item?.isVeg !== false,
    subCategory: item?.subCategory || "",
    selectedVariation:
      selectedVariation && selectedVariation.variationId ? selectedVariation : null,
    selectedAddons: normalizeAddonList(
      item?.selectedAddons || item?.addons || item?.addOns || [],
    ),
    customizations: item?.customizations || item?.customization || null,
    specialInstructions:
      item?.specialInstructions || item?.instructions || item?.note || "",
    pricingSnapshot: item?.pricingSnapshot || null,
  }
}

export function dedupeCartItems(items = [], fallback = {}) {
  const mergedItems = new Map()

  for (const item of items || []) {
    const normalizedItem = sanitizeCartItem(item, fallback)
    const lineKey = buildCartLineKey(normalizedItem)
    const existingItem = mergedItems.get(lineKey)

    if (existingItem) {
      existingItem.quantity += normalizedItem.quantity
      continue
    }

    mergedItems.set(lineKey, normalizedItem)
  }

  return Array.from(mergedItems.values())
}

export function buildCartMeta(items = [], explicitZoneId = null) {
  const firstItem = items[0] || null
  const zoneId =
    explicitZoneId ??
    (typeof window !== "undefined" ? window.localStorage?.getItem("userZoneId") : null) ??
    null

  return {
    zoneId: zoneId || null,
    restaurantId: firstItem?.restaurantId || null,
    restaurantName: firstItem?.restaurant || null,
    itemCount: items.reduce((total, item) => total + (item?.quantity || 0), 0),
    updatedAt: Date.now(),
  }
}

function createGuestSessionId() {
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function ensureGuestSessionId({ regenerate = false } = {}) {
  const sessionStorage = getSessionStorage()
  if (!sessionStorage) return createGuestSessionId()

  if (regenerate) {
    const freshGuestSessionId = createGuestSessionId()
    sessionStorage.setItem(GUEST_SESSION_STORAGE_KEY, freshGuestSessionId)
    return freshGuestSessionId
  }

  const existingGuestSessionId = sessionStorage.getItem(GUEST_SESSION_STORAGE_KEY)
  if (existingGuestSessionId) {
    return existingGuestSessionId
  }

  const freshGuestSessionId = createGuestSessionId()
  sessionStorage.setItem(GUEST_SESSION_STORAGE_KEY, freshGuestSessionId)
  return freshGuestSessionId
}

export function readGuestCartState() {
  const localStorage = getLocalStorage()
  if (!localStorage) return null
  return safeJsonParse(localStorage.getItem(GUEST_CART_STORAGE_KEY), null)
}

export function writeGuestCartState(state) {
  const localStorage = getLocalStorage()
  if (!localStorage) return

  if (!state || !Array.isArray(state.items) || state.items.length === 0) {
    localStorage.removeItem(GUEST_CART_STORAGE_KEY)
    return
  }

  const payload = safeJsonStringify(state)
  if (!payload) return
  localStorage.setItem(GUEST_CART_STORAGE_KEY, payload)
}

export function clearGuestCartState() {
  const localStorage = getLocalStorage()
  if (!localStorage) return
  localStorage.removeItem(GUEST_CART_STORAGE_KEY)
}

export function getMergedGuestSessionKey(guestSessionId) {
  return `${MERGED_GUEST_SESSION_PREFIX}:${guestSessionId}`
}

export function markGuestSessionMerged(guestSessionId, userId) {
  const localStorage = getLocalStorage()
  if (!localStorage || !guestSessionId || !userId) return
  const payload = safeJsonStringify({
    guestSessionId,
    userId: String(userId),
    mergedAt: Date.now(),
  })
  if (!payload) return
  localStorage.setItem(getMergedGuestSessionKey(guestSessionId), payload)
}

export function readMergedGuestSession(guestSessionId) {
  const localStorage = getLocalStorage()
  if (!localStorage || !guestSessionId) return null
  return safeJsonParse(localStorage.getItem(getMergedGuestSessionKey(guestSessionId)), null)
}

export function clearMergedGuestSession(guestSessionId) {
  const localStorage = getLocalStorage()
  if (!localStorage || !guestSessionId) return
  localStorage.removeItem(getMergedGuestSessionKey(guestSessionId))
}

export function getUserCartCacheKey(userId) {
  return `${AUTH_CART_CACHE_PREFIX}:${String(userId)}`
}

export function writeUserCartCache(userId, state) {
  const localStorage = getLocalStorage()
  if (!localStorage || !userId) return

  if (!state || !Array.isArray(state.items) || state.items.length === 0) {
    localStorage.removeItem(getUserCartCacheKey(userId))
    return
  }

  const payload = safeJsonStringify(state)
  if (!payload) return
  localStorage.setItem(getUserCartCacheKey(userId), payload)
}

export function clearUserCartCache(userId) {
  const localStorage = getLocalStorage()
  if (!localStorage || !userId) return
  localStorage.removeItem(getUserCartCacheKey(userId))
}

export function clearLegacyCartStorage() {
  const localStorage = getLocalStorage()
  if (!localStorage) return
  localStorage.removeItem("cart")
  localStorage.removeItem("cart_meta")
}

export function isCartZoneMismatch(meta) {
  if (typeof window === "undefined") return false
  if (!meta?.zoneId) return false

  const currentZoneId = window.localStorage?.getItem("userZoneId")
  if (!currentZoneId) return false

  return String(meta.zoneId) !== String(currentZoneId)
}

export const CART_STORAGE_KEYS = {
  GUEST_SESSION_STORAGE_KEY,
  GUEST_CART_STORAGE_KEY,
  AUTH_CART_CACHE_PREFIX,
}
