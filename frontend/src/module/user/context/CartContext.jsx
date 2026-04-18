import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import { authAPI, cartAPI } from "@/lib/api"
import { getModuleToken } from "@/lib/utils/auth"
import VariantPickerModal from "../components/VariantPickerModal"
import ReplaceCartModal from "../components/ReplaceCartModal"
import {
  buildCartLineKey,
  buildCartMeta,
  clearGuestCartState,
  clearLegacyCartStorage,
  clearUserCartCache,
  dedupeCartItems,
  ensureGuestSessionId,
  isCartZoneMismatch,
  markGuestSessionMerged,
  readGuestCartState,
  readMergedGuestSession,
  sanitizeCartItem,
  writeGuestCartState,
  writeUserCartCache,
} from "./cartPersistence"

const ZONE_CHANGE_CART_MESSAGE =
  "Your location has changed. Please add items from restaurants in your current area."

function readStoredUserLocation() {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage?.getItem("userLocation")
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function getReadableLocationAddress(location) {
  if (!location) return ""
  return (
    location.formattedAddress ||
    location.address ||
    [location.area, location.city, location.state].filter(Boolean).join(", ")
  )
}

function buildCartItem(item, restaurant, variation = null) {
  const validRestaurantId = restaurant?.restaurantId || restaurant?._id || restaurant?.id
  const base = {
    id: String(item.itemId ?? item.id),
    name: item.name,
    price:
      variation != null && variation.price != null
        ? Number(variation.price)
        : Number(item.price ?? 0),
    image: item.image,
    restaurant: restaurant?.name ?? item.restaurant,
    restaurantId: validRestaurantId ?? item.restaurantId,
    description: item.description ?? "",
    originalPrice: item.originalPrice ?? item.price,
    isVeg: item.isVeg !== false,
    subCategory: item.subCategory || "",
    selectedAddons: item.selectedAddons || [],
    customizations: item.customizations || null,
    specialInstructions: item.specialInstructions || "",
    pricingSnapshot: item.pricingSnapshot || null,
  }
  if (variation) {
    base.selectedVariation = {
      variationId: String(variation.id),
      variationName: variation.name || "",
      price: variation.price != null ? Number(variation.price) : item.price,
    }
  }
  return base
}

const defaultCartContext = {
  _isProvider: false,
  cart: [],
  items: [],
  itemCount: 0,
  total: 0,
  isCartReady: false,
  isCartSyncing: false,
  isCartMerging: false,
  cartOwner: { type: "guest", guestSessionId: null, userId: null, phone: null },
  lastAddEvent: null,
  lastRemoveEvent: null,
  addToCart: () => {
    console.warn("CartProvider not available - addToCart called")
  },
  removeFromCart: () => {
    console.warn("CartProvider not available - removeFromCart called")
  },
  updateQuantity: () => {
    console.warn("CartProvider not available - updateQuantity called")
  },
  getCartCount: () => 0,
  isInCart: () => false,
  getCartItem: () => null,
  clearCart: () => {
    console.warn("CartProvider not available - clearCart called")
  },
  cleanCartForRestaurant: () => {
    console.warn("CartProvider not available - cleanCartForRestaurant called")
  },
  openVariantPicker: () => {},
  closeVariantPicker: () => {},
  addItemOrAskVariant: () => {},
  bootstrapCart: () => Promise.resolve(),
}

const CartContext = createContext(defaultCartContext)

function getCurrentZoneId() {
  if (typeof window === "undefined") return null
  return window.localStorage?.getItem("userZoneId") || null
}

function getAuthenticatedUserPayload(response) {
  return response?.data?.data?.user || response?.data?.user || response?.data || null
}

function getCartPayload(response) {
  return response?.data?.data?.cart || response?.data?.cart || null
}

function buildAuthenticatedOwner(user) {
  return {
    type: "authenticated",
    userId: String(user?.id || user?._id || ""),
    phone: user?.phone || null,
    guestSessionId: null,
  }
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState([])
  const [cartMeta, setCartMeta] = useState(null)
  const [cartOwner, setCartOwner] = useState(() => ({
    type: "guest",
    guestSessionId: ensureGuestSessionId(),
    userId: null,
    phone: null,
  }))
  const [isCartReady, setIsCartReady] = useState(false)
  const [isCartSyncing, setIsCartSyncing] = useState(false)
  const [isCartMerging, setIsCartMerging] = useState(false)
  const [lastAddEvent, setLastAddEvent] = useState(null)
  const [lastRemoveEvent, setLastRemoveEvent] = useState(null)
  const [variantPicker, setVariantPicker] = useState({ item: null, restaurant: null })
  const [replaceCartPending, setReplaceCartPending] = useState(null)
  const [zoneChangePending, setZoneChangePending] = useState(null)

  const cartRef = useRef([])
  const cartOwnerRef = useRef(cartOwner)
  const bootSequenceRef = useRef(0)
  const skipNextServerSyncRef = useRef(false)
  const syncTimeoutRef = useRef(null)
  const suppressedZoneMismatchRef = useRef(null)

  useEffect(() => {
    cartRef.current = cart
  }, [cart])

  useEffect(() => {
    cartOwnerRef.current = cartOwner
  }, [cartOwner])

  const replaceCartState = useCallback((items, owner, options = {}) => {
    const nextItems = dedupeCartItems(items || [], {
      restaurantId: options.restaurantId,
      restaurantName: options.restaurantName,
    })
    setCart(nextItems)
    setCartOwner(owner)
    setCartMeta(nextItems.length ? buildCartMeta(nextItems, options.zoneId) : null)
  }, [])

  const bootstrapGuestCart = useCallback(
    ({ regenerateGuestSession = false } = {}) => {
      clearLegacyCartStorage()
      const guestSessionId = ensureGuestSessionId({ regenerate: regenerateGuestSession })
      const storedGuestCart = readGuestCartState()

      if (!storedGuestCart || !Array.isArray(storedGuestCart.items) || storedGuestCart.items.length === 0) {
        replaceCartState([], {
          type: "guest",
          guestSessionId,
          userId: null,
          phone: null,
        })
        setIsCartReady(true)
        return
      }

      const storedGuestSessionId = storedGuestCart?.owner?.guestSessionId || null
      if (storedGuestSessionId && storedGuestSessionId !== guestSessionId) {
        clearGuestCartState()
        replaceCartState([], {
          type: "guest",
          guestSessionId,
          userId: null,
          phone: null,
        })
        setIsCartReady(true)
        return
      }

      if (isCartZoneMismatch(storedGuestCart.meta)) {
        clearGuestCartState()
        replaceCartState([], {
          type: "guest",
          guestSessionId,
          userId: null,
          phone: null,
        })
        setIsCartReady(true)
        return
      }

      replaceCartState(
        storedGuestCart.items,
        {
          type: "guest",
          guestSessionId,
          userId: null,
          phone: null,
        },
        {
          zoneId: storedGuestCart?.meta?.zoneId || getCurrentZoneId(),
          restaurantId: storedGuestCart?.meta?.restaurantId || null,
          restaurantName: storedGuestCart?.meta?.restaurantName || null,
        },
      )
      setIsCartReady(true)
    },
    [replaceCartState],
  )

  const bootstrapAuthenticatedCart = useCallback(
    async (bootstrapId) => {
      const authenticatedUserResponse = await authAPI.getCurrentUser()
      if (bootstrapId !== bootSequenceRef.current) return

      const authenticatedUser = getAuthenticatedUserPayload(authenticatedUserResponse)
      if (!authenticatedUser?.id && !authenticatedUser?._id) {
        throw new Error("Authenticated user could not be validated.")
      }

      const nextCartOwner = buildAuthenticatedOwner(authenticatedUser)
      const storedGuestCart = readGuestCartState()
      const guestSessionId = storedGuestCart?.owner?.guestSessionId || null
      const previousMergeRecord = guestSessionId
        ? readMergedGuestSession(guestSessionId)
        : null

      let resolvedCartPayload = null

      if (
        guestSessionId &&
        Array.isArray(storedGuestCart?.items) &&
        storedGuestCart.items.length > 0 &&
        !isCartZoneMismatch(storedGuestCart?.meta) &&
        String(previousMergeRecord?.userId || "") !== nextCartOwner.userId
      ) {
        setIsCartMerging(true)
        setIsCartSyncing(true)
        const mergeResponse = await cartAPI.mergeGuestCart({
          guestSessionId,
          guestCart: {
            items: storedGuestCart.items,
            restaurantId: storedGuestCart?.meta?.restaurantId || null,
            restaurantName: storedGuestCart?.meta?.restaurantName || null,
            zoneId: storedGuestCart?.meta?.zoneId || null,
          },
        })
        if (bootstrapId !== bootSequenceRef.current) return
        resolvedCartPayload = getCartPayload(mergeResponse)
        markGuestSessionMerged(guestSessionId, nextCartOwner.userId)
        clearGuestCartState()
        setIsCartMerging(false)
      }

      if (!resolvedCartPayload) {
        const cartResponse = await cartAPI.getCart()
        if (bootstrapId !== bootSequenceRef.current) return
        resolvedCartPayload = getCartPayload(cartResponse)
      }

      const nextItems = dedupeCartItems(resolvedCartPayload?.items || [], {
        restaurantId: resolvedCartPayload?.restaurantId,
        restaurantName: resolvedCartPayload?.restaurantName,
      })

      skipNextServerSyncRef.current = true
      replaceCartState(nextItems, nextCartOwner, {
        zoneId: resolvedCartPayload?.zoneId || getCurrentZoneId(),
        restaurantId: resolvedCartPayload?.restaurantId || null,
        restaurantName: resolvedCartPayload?.restaurantName || null,
      })
      writeUserCartCache(nextCartOwner.userId, {
        owner: nextCartOwner,
        meta: buildCartMeta(nextItems, resolvedCartPayload?.zoneId || getCurrentZoneId()),
        items: nextItems,
      })
      setIsCartSyncing(false)
      setIsCartMerging(false)
      setIsCartReady(true)
    },
    [replaceCartState],
  )

  const bootstrapCart = useCallback(
    async ({ regenerateGuestSession = false } = {}) => {
      const bootstrapId = bootSequenceRef.current + 1
      bootSequenceRef.current = bootstrapId
      setIsCartReady(false)
      setIsCartSyncing(false)
      setIsCartMerging(false)

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
        syncTimeoutRef.current = null
      }

      const userToken = getModuleToken("user")
      if (!userToken) {
        bootstrapGuestCart({ regenerateGuestSession })
        return
      }

      try {
        await bootstrapAuthenticatedCart(bootstrapId)
      } catch {
        if (bootstrapId !== bootSequenceRef.current) return
        bootstrapGuestCart({ regenerateGuestSession })
      }
    },
    [bootstrapAuthenticatedCart, bootstrapGuestCart],
  )

  const openVariantPicker = useCallback((item, restaurant) => {
    if (item?.variations?.length) {
      setVariantPicker({
        item: { ...item, id: item.itemId ?? item.id },
        restaurant: restaurant || null,
      })
    }
  }, [])

  const closeVariantPicker = useCallback(() => {
    setVariantPicker({ item: null, restaurant: null })
  }, [])

  const addItemWithVariant = (item, variation, restaurant, event = null) => {
    const resolvedRestaurant =
      restaurant || (item?.restaurant ? { name: item.restaurant, restaurantId: item.restaurantId } : null)
    if (!resolvedRestaurant?.name && !item?.restaurant) {
      toast.error("Restaurant information missing.")
      return
    }
    const cartItem = buildCartItem(item, resolvedRestaurant, variation)
    let sourcePosition = null
    if (event?.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect()
      sourcePosition = {
        viewportX: rect.left + rect.width / 2,
        viewportY: rect.top + rect.height / 2,
        scrollX: window.pageXOffset || 0,
        scrollY: window.pageYOffset || 0,
        itemId: cartItem.id,
      }
    }
    try {
      addToCart(cartItem, sourcePosition)
      closeVariantPicker()
      toast.success("Added to cart")
    } catch (error) {
      toast.error(error.message || "Could not add to cart")
    }
  }

  const addItemOrAskVariant = (item, restaurant, event = null) => {
    const hasVariations = item?.variations && item.variations.length > 0
    if (hasVariations) {
      openVariantPicker(item, restaurant)
      return
    }
    const resolvedRestaurant = restaurant || { name: item.restaurant, restaurantId: item.restaurantId }
    if (!resolvedRestaurant?.name && !item.restaurant) {
      toast.error("Restaurant information missing.")
      return
    }
    const cartItem = buildCartItem(item, resolvedRestaurant, null)
    let sourcePosition = null
    if (event?.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect()
      sourcePosition = {
        viewportX: rect.left + rect.width / 2,
        viewportY: rect.top + rect.height / 2,
        scrollX: window.pageXOffset || 0,
        scrollY: window.pageYOffset || 0,
        itemId: cartItem.id,
      }
    }
    try {
      addToCart(cartItem, sourcePosition)
      toast.success("Added to cart")
    } catch (error) {
      toast.error(error.message || "Could not add to cart")
    }
  }

  useEffect(() => {
    if (!isCartReady) return

    const nextMeta = cart.length > 0 ? buildCartMeta(cart) : null
    setCartMeta(nextMeta)

    if (cartOwner.type === "guest") {
      writeGuestCartState({
        owner: {
          type: "guest",
          guestSessionId: cartOwner.guestSessionId || ensureGuestSessionId(),
        },
        meta: nextMeta,
        items: cart,
      })
      return
    }

    if (!cartOwner.userId) return

    writeUserCartCache(cartOwner.userId, {
      owner: cartOwner,
      meta: nextMeta,
      items: cart,
    })

    if (skipNextServerSyncRef.current) {
      skipNextServerSyncRef.current = false
      return
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    syncTimeoutRef.current = setTimeout(async () => {
      try {
        setIsCartSyncing(true)
        await cartAPI.replaceCart({
          items: cartRef.current,
          restaurantId: nextMeta?.restaurantId || null,
          restaurantName: nextMeta?.restaurantName || null,
          zoneId: nextMeta?.zoneId || null,
        })
      } catch {
        // keep local cart state and sync again on next change
      } finally {
        setIsCartSyncing(false)
      }
    }, 350)

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
        syncTimeoutRef.current = null
      }
    }
  }, [cart, cartOwner, isCartReady])

  useEffect(() => {
    bootstrapCart()
  }, [bootstrapCart])

  useEffect(() => {
    const onLogout = () => {
      if (cartOwnerRef.current?.userId) {
        clearUserCartCache(cartOwnerRef.current.userId)
      }
      bootstrapCart({ regenerateGuestSession: true })
    }

    const onAuthChanged = () => {
      bootstrapCart()
    }

    window.addEventListener("userLogout", onLogout)
    window.addEventListener("userAuthChanged", onAuthChanged)

    return () => {
      window.removeEventListener("userLogout", onLogout)
      window.removeEventListener("userAuthChanged", onAuthChanged)
    }
  }, [bootstrapCart])

  useEffect(() => {
    if (typeof window === "undefined") return

    const currentZoneId = getCurrentZoneId()
    if (
      cart.length > 0 &&
      cartMeta?.zoneId &&
      currentZoneId &&
      cartMeta.zoneId !== currentZoneId &&
      !zoneChangePending &&
      suppressedZoneMismatchRef.current !== currentZoneId
    ) {
      const storedLocation = readStoredUserLocation()
      setZoneChangePending({
        previousZoneId: cartMeta.zoneId,
        currentZoneId,
        cartRestaurantName: cartMeta.restaurantName || cart[0]?.restaurant || "Restaurant",
        itemCount: cart.reduce((total, item) => total + (item.quantity || 0), 0),
        currentZoneName: "Selected location",
        currentAddress: getReadableLocationAddress(storedLocation),
      })
    }
  }, [cart, cart.length, cartMeta?.restaurantName, cartMeta?.zoneId, zoneChangePending])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleZoneChanged = (event) => {
      const nextZoneId = event?.detail?.currentZoneId || getCurrentZoneId()
      const currentZone = event?.detail?.currentZone || null
      const currentLocation = event?.detail?.currentLocation || readStoredUserLocation()
      suppressedZoneMismatchRef.current = null
      setReplaceCartPending(null)
      setVariantPicker({ item: null, restaurant: null })
      setZoneChangePending((previousPending) => {
        if (cartRef.current.length === 0) return null
        return previousPending || {
          previousZoneId: event?.detail?.previousZoneId || cartMeta?.zoneId || null,
          currentZoneId: nextZoneId,
          cartRestaurantName:
            cartMeta?.restaurantName || cartRef.current[0]?.restaurant || "Restaurant",
          itemCount: cartRef.current.reduce(
            (total, item) => total + (item.quantity || 0),
            0,
          ),
          currentZoneName:
            currentZone?.name ||
            currentZone?.zoneName ||
            currentZone?.area ||
            "Selected location",
          currentAddress: getReadableLocationAddress(currentLocation),
        }
      })
    }

    window.addEventListener("userZoneChanged", handleZoneChanged)
    return () => window.removeEventListener("userZoneChanged", handleZoneChanged)
  }, [cartMeta?.restaurantName, cartMeta?.zoneId])

  const addToCart = (item, sourcePosition = null) => {
    const currentZoneId = getCurrentZoneId()
    let activeCart = cart
    if (cartMeta?.zoneId && currentZoneId && cartMeta.zoneId !== currentZoneId) {
      setReplaceCartPending(null)
      closeVariantPicker()
      const storedLocation = readStoredUserLocation()
      setZoneChangePending({
        previousZoneId: cartMeta.zoneId,
        currentZoneId,
        cartRestaurantName: cartMeta.restaurantName || cart[0]?.restaurant || "Restaurant",
        itemCount: cart.reduce((total, cartItem) => total + (cartItem.quantity || 0), 0),
        currentZoneName: "Selected location",
        currentAddress: getReadableLocationAddress(storedLocation),
      })
      toast.error(ZONE_CHANGE_CART_MESSAGE)
      return
    }

    if (activeCart.length > 0) {
      const firstItemRestaurantName = activeCart[0]?.restaurant
      const newItemRestaurantName = item?.restaurant
      const firstItemRestaurantId = activeCart[0]?.restaurantId
      const newItemRestaurantId = item?.restaurantId

      const normalizeName = (name) => (name ? name.trim().toLowerCase() : "")
      const firstRestaurantNameNormalized = normalizeName(firstItemRestaurantName)
      const newRestaurantNameNormalized = normalizeName(newItemRestaurantName)

      const isDifferentRestaurant =
        (firstRestaurantNameNormalized &&
          newRestaurantNameNormalized &&
          firstRestaurantNameNormalized !== newRestaurantNameNormalized) ||
        ((!firstRestaurantNameNormalized || !newRestaurantNameNormalized) &&
          firstItemRestaurantId &&
          newItemRestaurantId &&
          String(firstItemRestaurantId) !== String(newItemRestaurantId))

      if (isDifferentRestaurant) {
        closeVariantPicker()
        setReplaceCartPending({
          cartRestaurantName: firstItemRestaurantName || "another restaurant",
          newRestaurantName: newItemRestaurantName || "this restaurant",
          item: { ...item, quantity: 1 },
          sourcePosition,
        })
        return
      }
    }

    setCart((previousCart) => {
      const normalizedItem = sanitizeCartItem(item, {
        restaurantId: item?.restaurantId,
        restaurantName: item?.restaurant,
      })
      const itemLineKey = buildCartLineKey(normalizedItem)
      const existingItem = previousCart.find(
        (cartLineItem) => buildCartLineKey(cartLineItem) === itemLineKey,
      )

      if (existingItem) {
        if (sourcePosition) {
          setLastAddEvent({
            product: {
              id: item.id,
              name: item.name,
              imageUrl: item.image || item.imageUrl,
            },
            sourcePosition,
          })
          setTimeout(() => setLastAddEvent(null), 1500)
        }
        return previousCart.map((cartLineItem) =>
          buildCartLineKey(cartLineItem) === itemLineKey
            ? { ...cartLineItem, quantity: cartLineItem.quantity + 1 }
            : cartLineItem,
        )
      }

      if (!item.restaurantId && !item.restaurant) {
        throw new Error("Item is missing restaurant information. Please refresh the page.")
      }

      const newItem = { ...normalizedItem, quantity: 1 }

      if (sourcePosition) {
        setLastAddEvent({
          product: {
            id: item.id,
            name: item.name,
            imageUrl: item.image || item.imageUrl,
          },
          sourcePosition,
        })
        setTimeout(() => setLastAddEvent(null), 1500)
      }

      return [...previousCart, newItem]
    })
  }

  const removeFromCart = (
    itemId,
    sourcePosition = null,
    productInfo = null,
    variationId = null,
  ) => {
    setCart((previousCart) => {
      const itemToRemove = previousCart.find((cartLineItem) =>
        variationId != null
          ? String(cartLineItem.id) === String(itemId) &&
            String(cartLineItem.selectedVariation?.variationId || "") ===
              String(variationId)
          : String(cartLineItem.id) === String(itemId),
      )
      if (itemToRemove && sourcePosition && productInfo) {
        setLastRemoveEvent({
          product: {
            id: productInfo.id || itemToRemove.id,
            name: productInfo.name || itemToRemove.name,
            imageUrl:
              productInfo.imageUrl ||
              productInfo.image ||
              itemToRemove.image ||
              itemToRemove.imageUrl,
          },
          sourcePosition,
        })
        setTimeout(() => setLastRemoveEvent(null), 1500)
      }
      return previousCart.filter((cartLineItem) =>
        variationId != null
          ? !(
              String(cartLineItem.id) === String(itemId) &&
              String(cartLineItem.selectedVariation?.variationId || "") ===
                String(variationId)
            )
          : String(cartLineItem.id) !== String(itemId),
      )
    })
  }

  const updateQuantity = (
    itemId,
    quantity,
    sourcePosition = null,
    productInfo = null,
    variationId = null,
  ) => {
    const matchesItem = (item) =>
      variationId != null
        ? String(item.id) === String(itemId) &&
          String(item.selectedVariation?.variationId || "") === String(variationId)
        : String(item.id) === String(itemId)

    if (quantity <= 0) {
      setCart((previousCart) => {
        const itemToRemove = previousCart.find((cartLineItem) => matchesItem(cartLineItem))
        if (itemToRemove && sourcePosition && productInfo) {
          setLastRemoveEvent({
            product: {
              id: productInfo.id || itemToRemove.id,
              name: productInfo.name || itemToRemove.name,
              imageUrl:
                productInfo.imageUrl ||
                productInfo.image ||
                itemToRemove.image ||
                itemToRemove.imageUrl,
            },
            sourcePosition,
          })
          setTimeout(() => setLastRemoveEvent(null), 1500)
        }
        return previousCart.filter((cartLineItem) => !matchesItem(cartLineItem))
      })
      return
    }

    setCart((previousCart) => {
      const existingItem = previousCart.find((cartLineItem) => matchesItem(cartLineItem))
      if (
        existingItem &&
        quantity < existingItem.quantity &&
        sourcePosition &&
        productInfo
      ) {
        setLastRemoveEvent({
          product: {
            id: productInfo.id || existingItem.id,
            name: productInfo.name || existingItem.name,
            imageUrl:
              productInfo.imageUrl ||
              productInfo.image ||
              existingItem.image ||
              existingItem.imageUrl,
          },
          sourcePosition,
        })
        setTimeout(() => setLastRemoveEvent(null), 1500)
      }
      return previousCart.map((cartLineItem) =>
        matchesItem(cartLineItem)
          ? { ...cartLineItem, quantity }
          : cartLineItem,
      )
    })
  }

  const getCartCount = () =>
    cart.reduce((total, item) => total + (item.quantity || 0), 0)

  const isInCart = (itemId, variationId = null) =>
    cart.some((item) =>
      variationId != null
        ? String(item.id) === String(itemId) &&
          String(item.selectedVariation?.variationId || "") === String(variationId)
        : String(item.id) === String(itemId),
    )

  const getCartItem = (itemId, variationId = null) =>
    cart.find((item) =>
      variationId != null
        ? String(item.id) === String(itemId) &&
          String(item.selectedVariation?.variationId || "") === String(variationId)
        : String(item.id) === String(itemId),
    )

  const clearCart = () => {
    replaceCartState([], cartOwnerRef.current, { zoneId: getCurrentZoneId() })
    if (cartOwnerRef.current.type === "guest") {
      clearGuestCartState()
    }
  }

  const confirmReplaceCart = useCallback(() => {
    if (!replaceCartPending) return
    const { item, sourcePosition } = replaceCartPending
    setReplaceCartPending(null)
    closeVariantPicker()
    setCart([item])
    const currentZoneId = getCurrentZoneId()
    setCartMeta({
      zoneId: currentZoneId || null,
      restaurantId: item?.restaurantId || null,
      restaurantName: item?.restaurant || null,
      updatedAt: Date.now(),
    })
    if (sourcePosition) {
      setLastAddEvent({
        product: { id: item.id, name: item.name, imageUrl: item.image || item.imageUrl },
        sourcePosition,
      })
      setTimeout(() => setLastAddEvent(null), 1500)
    }
    toast.success("Added to cart")
  }, [closeVariantPicker, replaceCartPending])

  const cancelReplaceCart = useCallback(() => {
    setReplaceCartPending(null)
  }, [])

  const confirmLocationCartReplace = useCallback(() => {
    const currentZoneId = zoneChangePending?.currentZoneId || getCurrentZoneId()
    suppressedZoneMismatchRef.current = null
    setZoneChangePending(null)
    setReplaceCartPending(null)
    closeVariantPicker()
    replaceCartState([], cartOwnerRef.current, { zoneId: currentZoneId })
    if (cartOwnerRef.current.type === "guest") {
      clearGuestCartState()
    }
    toast.success("Location changed. Please add items available in this area.")
  }, [closeVariantPicker, replaceCartState, zoneChangePending?.currentZoneId])

  const cancelLocationCartReplace = useCallback(() => {
    suppressedZoneMismatchRef.current = zoneChangePending?.currentZoneId || getCurrentZoneId()
    setZoneChangePending(null)
  }, [zoneChangePending?.currentZoneId])

  const cleanCartForRestaurant = (restaurantId, restaurantName) => {
    setCart((previousCart) => {
      if (previousCart.length === 0) return previousCart

      const normalizeName = (name) => (name ? name.trim().toLowerCase() : "")
      const targetRestaurantNameNormalized = normalizeName(restaurantName)

      return previousCart.filter((item) => {
        const itemRestaurantId = item?.restaurantId
        const itemRestaurantName = item?.restaurant
        const itemRestaurantNameNormalized = normalizeName(itemRestaurantName)

        if (targetRestaurantNameNormalized && itemRestaurantNameNormalized) {
          return itemRestaurantNameNormalized === targetRestaurantNameNormalized
        }
        if (restaurantId && itemRestaurantId) {
          return (
            itemRestaurantId === restaurantId ||
            itemRestaurantId === restaurantId.toString() ||
            itemRestaurantId.toString() === restaurantId
          )
        }
        return false
      })
    })
    const currentZoneId = getCurrentZoneId()
    setCartMeta({
      zoneId: currentZoneId || null,
      restaurantId: restaurantId || null,
      restaurantName: restaurantName || null,
      updatedAt: Date.now(),
    })
  }

  useEffect(() => {
    if (cart.length === 0) return

    const restaurantIds = cart.map((item) => item.restaurantId).filter(Boolean)
    const restaurantNames = cart.map((item) => item.restaurant).filter(Boolean)
    const uniqueRestaurantIds = [...new Set(restaurantIds)]
    const uniqueRestaurantNames = [...new Set(restaurantNames.map((name) => name.trim().toLowerCase()))]

    if (uniqueRestaurantIds.length > 1 || uniqueRestaurantNames.length > 1) {
      const firstRestaurantId = restaurantIds[0]
      const firstRestaurantName = restaurantNames[0]

      setCart((previousCart) =>
        previousCart.filter((item) => {
          const normalizedFirstRestaurantName = firstRestaurantName
            ? firstRestaurantName.trim().toLowerCase()
            : ""
          const normalizedItemRestaurantName = item?.restaurant
            ? item.restaurant.trim().toLowerCase()
            : ""

          if (normalizedFirstRestaurantName && normalizedItemRestaurantName) {
            return normalizedFirstRestaurantName === normalizedItemRestaurantName
          }

          if (firstRestaurantId && item?.restaurantId) {
            return String(firstRestaurantId) === String(item.restaurantId)
          }

          return false
        }),
      )
    }
  }, [])

  const cartForAnimation = useMemo(() => {
    const items = cart.map((item) => ({
      product: {
        id: item.id,
        name: item.name,
        imageUrl: item.image || item.imageUrl,
      },
      quantity: item.quantity || 1,
    }))

    const itemCount = cart.reduce((total, item) => total + (item.quantity || 0), 0)
    const total = cart.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
      0,
    )

    return {
      items,
      itemCount,
      total,
    }
  }, [cart])

  const value = useMemo(
    () => ({
      _isProvider: true,
      cart,
      items: cartForAnimation.items,
      itemCount: cartForAnimation.itemCount,
      total: cartForAnimation.total,
      isCartReady,
      isCartSyncing,
      isCartMerging,
      cartOwner,
      lastAddEvent,
      lastRemoveEvent,
      addToCart,
      removeFromCart,
      updateQuantity,
      getCartCount,
      isInCart,
      getCartItem,
      clearCart,
      cleanCartForRestaurant,
      openVariantPicker,
      closeVariantPicker,
      addItemOrAskVariant,
      addItemWithVariant,
      bootstrapCart,
    }),
    [
      cart,
      cartForAnimation,
      isCartReady,
      isCartSyncing,
      isCartMerging,
      cartOwner,
      lastAddEvent,
      lastRemoveEvent,
      addItemOrAskVariant,
      addItemWithVariant,
      bootstrapCart,
      cleanCartForRestaurant,
      closeVariantPicker,
      openVariantPicker,
    ],
  )

  return (
    <CartContext.Provider value={value}>
      {children}
      {variantPicker.item && (
        <VariantPickerModal
          item={variantPicker.item}
          onSelectVariation={(variation, event) =>
            addItemWithVariant(
              variantPicker.item,
              variation,
              variantPicker.restaurant,
              event,
            )
          }
          onClose={closeVariantPicker}
        />
      )}
      <ReplaceCartModal
        isOpen={!!replaceCartPending}
        cartRestaurantName={replaceCartPending?.cartRestaurantName}
        newRestaurantName={replaceCartPending?.newRestaurantName}
        onReplace={confirmReplaceCart}
        onCancel={cancelReplaceCart}
      />
      <ReplaceCartModal
        isOpen={!!zoneChangePending}
        mode="location"
        cartRestaurantName={zoneChangePending?.cartRestaurantName}
        itemCount={zoneChangePending?.itemCount || 0}
        currentZoneName={zoneChangePending?.currentZoneName}
        currentAddress={zoneChangePending?.currentAddress}
        onReplace={confirmLocationCartReplace}
        onCancel={cancelLocationCartReplace}
      />
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context || context._isProvider !== true) {
    if (process.env.NODE_ENV === "development") {
      console.warn("useCart called outside CartProvider. Using default values.")
    }
    return defaultCartContext
  }
  return context
}
