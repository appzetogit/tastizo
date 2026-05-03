import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Clock3,
  X,
  Download,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Minus,
  Phone,
  Plus,
  Search,
  Star,
  Truck,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react"
import { restaurantAPI } from "@food/api"
import ResendNotificationButton from "@food/components/restaurant/ResendNotificationButton"
import RestaurantDesktopShell from "./RestaurantDesktopShell"

const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const firstFiniteNumber = (...values) => {
  for (const value of values) {
    const num = toNumber(value)
    if (num !== null) return num
  }
  return 0
}

const currency = (value) => `₹${Number(value || 0).toFixed(0)}`

const normalizeStatus = (status) => String(status || "").trim().toLowerCase().replace(/\s+/g, "_")

const formatDateLabel = (value) => {
  if (!value) return "Today"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Today"
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

const formatTimeLabel = (value) => {
  if (!value) return "--:--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--:--"
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
}

const formatRelativePlacedLabel = (value) => {
  if (!value) return "Placed recently"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Placed recently"

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))
  if (diffMinutes < 1) return "Placed just now"
  if (diffMinutes === 1) return "Placed 1 minute ago"
  if (diffMinutes < 60) return `Placed ${diffMinutes} minutes ago`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours === 1) return "Placed 1 hour ago"
  if (diffHours < 24) return `Placed ${diffHours} hours ago`

  const diffDays = Math.round(diffHours / 24)
  return diffDays === 1 ? "Placed 1 day ago" : `Placed ${diffDays} days ago`
}

const addMinutes = (value, minutes) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getTime() + minutes * 60000)
}

const getOrderTaxValue = (order) =>
  firstFiniteNumber(order?.pricing?.tax, order?.pricing?.gst, order?.tax, order?.gst)

const getOrderDiscountValue = (order) =>
  firstFiniteNumber(
    order?.pricing?.discount,
    order?.pricing?.couponDiscount,
    order?.discount,
    order?.couponDiscount,
  )

const getOrderPaymentStatusLabel = (order) => {
  const paymentStatus = String(order?.payment?.status || order?.paymentStatus || "").toLowerCase()
  const paymentMethod = String(order?.payment?.method || order?.paymentMethod || "").toLowerCase()
  const orderStatus = normalizeStatus(order?.status)

  if (["completed", "paid", "captured", "success", "succeeded"].includes(paymentStatus)) return "PAID"
  if (["refunded", "refund"].includes(paymentStatus)) return "REFUNDED"
  if (["failed", "declined"].includes(paymentStatus)) return "FAILED"
  if (paymentMethod === "cash" || paymentMethod === "cod") {
    return orderStatus === "delivered" || orderStatus === "completed" ? "PAID" : "COD"
  }
  return "PENDING"
}

const getOrderTimelineSteps = (order) => {
  const normalizedStatus = normalizeStatus(order?.status)
  const createdAt = order?.createdAt
  const prepMinutes = firstFiniteNumber(order?.preparationTime, order?.estimatedPreparationTime, order?.etaMins, 15)
  const deliveryMinutes = firstFiniteNumber(order?.estimatedDeliveryTime, 30)

  const estimatedPickup =
    order?.estimatedPickupTime ||
    order?.tracking?.ready?.timestamp ||
    order?.tracking?.preparing?.timestamp ||
    addMinutes(createdAt, prepMinutes)

  const estimatedDelivery =
    order?.estimatedDeliveryAt ||
    order?.tracking?.delivered?.timestamp ||
    order?.tracking?.outForDelivery?.timestamp ||
    addMinutes(createdAt, deliveryMinutes)

  return [
    { label: "Placed", time: formatTimeLabel(createdAt), active: true },
    {
      label: "Estimated pickup",
      time: formatTimeLabel(estimatedPickup),
      active: ["confirmed", "pending", "preparing", "ready", "ready_for_pickup", "out_for_delivery", "delivered", "completed"].includes(normalizedStatus),
    },
    {
      label: "Estimated delivery",
      time: formatTimeLabel(estimatedDelivery),
      active: ["ready", "ready_for_pickup", "out_for_delivery", "delivered", "completed"].includes(normalizedStatus),
    },
  ]
}

const formatStatusLabel = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Pending"

const formatIssueLabel = (value) =>
  String(value || "Other")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())

const normalizeRating = (value) => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.min(5, Math.round(parsed * 10) / 10)
}

const extractReviewRating = (order) =>
  normalizeRating(
    order?.review?.rating ??
      order?.ratings?.restaurant?.rating ??
      order?.feedback?.rating ??
      order?.rating,
  )

const extractReviewText = (order) => {
  const raw =
    order?.review?.comment ??
    order?.review?.text ??
    order?.ratings?.restaurant?.comment ??
    order?.feedback?.comment ??
    order?.feedback?.text ??
    ""
  const normalized = String(raw || "").trim()
  return normalized || ""
}

const toComparableId = (value) => String(value?._id || value || "").trim()

const formatOrderCountLabel = (count) => {
  const numeric = Number(count || 0)
  if (!numeric) return "New customer"
  return `${numeric} order${numeric === 1 ? "" : "s"} with you`
}

const getComplaintStatusTone = (status) => {
  const normalized = String(status || "open").toLowerCase()
  if (["resolved", "closed"].includes(normalized)) return "bg-[#e6f8ea] text-[#23935c]"
  if (["rejected"].includes(normalized)) return "bg-[#fde9ea] text-[#d2555d]"
  if (["in_progress", "pending"].includes(normalized)) return "bg-[#fff3de] text-[#b67a06]"
  return "bg-[#eef2ff] text-[#4b67bb]"
}

const getOrderTotalValue = (orderLike) => {
  if (!orderLike) return 0

  const directTotal = Number(orderLike.total)
  if (Number.isFinite(directTotal) && directTotal > 0) return directTotal

  const pricingTotal = Number(orderLike.pricing?.total)
  if (Number.isFinite(pricingTotal) && pricingTotal > 0) return pricingTotal

  const amountDue = Number(orderLike.payment?.amountDue)
  if (Number.isFinite(amountDue) && amountDue > 0) return amountDue

  const items = Array.isArray(orderLike.items) ? orderLike.items : []
  const itemsTotal = items.reduce((sum, item) => {
    const price = Number(item?.price || 0)
    const qty = Number(item?.quantity || 0)
    return sum + (Number.isFinite(price) ? price : 0) * (Number.isFinite(qty) ? qty : 0)
  }, 0)

  return Number.isFinite(itemsTotal) ? itemsTotal : 0
}

const formatCountdownLabel = (seconds) => {
  const safe = Math.max(0, Number(seconds || 0))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins}:${String(secs).padStart(2, "0")}`
}

const getRangeWindow = (range) => {
  const now = new Date()
  const end = now
  const start = new Date(now)
  const previousEnd = new Date(now)
  const previousStart = new Date(now)

  if (range === "daily") {
    start.setDate(start.getDate() - 1)
    previousEnd.setDate(previousEnd.getDate() - 1)
    previousStart.setDate(previousStart.getDate() - 2)
  } else if (range === "weekly") {
    start.setDate(start.getDate() - 7)
    previousEnd.setDate(previousEnd.getDate() - 7)
    previousStart.setDate(previousStart.getDate() - 14)
  } else {
    start.setDate(start.getDate() - 30)
    previousEnd.setDate(previousEnd.getDate() - 30)
    previousStart.setDate(previousStart.getDate() - 60)
  }

  return { start, end, previousStart, previousEnd }
}

const withinWindow = (value, start, end) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date >= start && date <= end
}

const formatDelta = (current, previous, asPercent = false) => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "—"
  if (previous === 0) {
    if (current === 0) return "0%"
    return "New"
  }

  const diffPercent = ((current - previous) / previous) * 100
  const rounded = Math.round(diffPercent)
  const prefix = rounded > 0 ? "+" : ""
  return `${prefix}${rounded}%`
}

function useRestaurantOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const loadOrders = useCallback(async (keepLoading = false) => {
    let nextOrders = []
    try {
      if (!keepLoading) {
        setLoading(true)
      }
      const response = await restaurantAPI.getOrders({ page: 1, limit: 100 })
      nextOrders = response?.data?.data?.orders || []
      setOrders(Array.isArray(nextOrders) ? nextOrders : [])
    } catch {
      setOrders([])
    } finally {
      if (!keepLoading) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const guardedLoad = async (keepLoading = false) => {
      try {
        const response = await restaurantAPI.getOrders({ page: 1, limit: 100 })
        const nextOrders = response?.data?.data?.orders || []
        if (isMounted) {
          setOrders(Array.isArray(nextOrders) ? nextOrders : [])
        }
      } catch {
        if (isMounted) {
          setOrders([])
        }
      } finally {
        if (isMounted && !keepLoading) {
          setLoading(false)
        }
      }
    }

    guardedLoad()
    const intervalId = setInterval(() => {
      if (isMounted) {
        guardedLoad(true)
      }
    }, 15000)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [])

  return { orders, loading, reloadOrders: loadOrders }
}

function useRestaurantMenuSections() {
  const [sections, setSections] = useState([])

  useEffect(() => {
    let isMounted = true
    const loadMenu = async () => {
      try {
        const response = await restaurantAPI.getMenu()
        const nextSections = response?.data?.data?.menu?.sections || []
        if (isMounted) {
          setSections(Array.isArray(nextSections) ? nextSections : [])
        }
      } catch {
        if (isMounted) {
          setSections([])
        }
      }
    }

    loadMenu()
    return () => {
      isMounted = false
    }
  }, [])

  return sections
}

function useRestaurantOffers() {
  const [offers, setOffers] = useState([])
  const [restaurantName, setRestaurantName] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadOffers = async () => {
      if (isMounted) {
        setLoading(true)
      }
      try {
        const [restaurantResponse, offersResponse] = await Promise.all([
          restaurantAPI.getCurrentRestaurant(),
          restaurantAPI.getPublicOffers(),
        ])
        const currentRestaurant =
          restaurantResponse?.data?.data?.restaurant ||
          restaurantResponse?.data?.restaurant ||
          null
        const list =
          offersResponse?.data?.data?.allOffers ||
          offersResponse?.data?.allOffers ||
          offersResponse?.data?.data?.offers ||
          offersResponse?.data?.data ||
          []
        if (!isMounted) return

        const currentName = String(currentRestaurant?.name || "").trim().toLowerCase()
        setRestaurantName(currentRestaurant?.name || "")

        const filtered = Array.isArray(list)
          ? list.filter((offer) => {
              if (!currentName) return true
              const offerRestaurant = String(
                offer?.restaurantName || offer?.restaurant?.name || offer?.restaurantId?.name || "",
              )
                .trim()
                .toLowerCase()
              return !offerRestaurant || offerRestaurant === currentName
            })
          : []
        setOffers(filtered)
      } catch {
        if (isMounted) {
          setOffers([])
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadOffers()
    return () => {
      isMounted = false
    }
  }, [])

  return { offers, restaurantName, loading }
}

function DesktopStatPill({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
        active
          ? "border-[#4f78ee] bg-[#4f78ee] text-white shadow-[0_10px_24px_rgba(79,120,238,0.2)]"
          : "border-[#d9deea] bg-white text-[#586173] hover:border-[#bfc8db]"
      }`}
    >
      {children}
    </button>
  )
}

export function DesktopOrdersView() {
  const { orders, loading, reloadOrders } = useRestaurantOrders()
  const [activeTab, setActiveTab] = useState("requests")
  const [query, setQuery] = useState("")
  const [actingOrderId, setActingOrderId] = useState("")
  const [desktopPopupOrderId, setDesktopPopupOrderId] = useState("")
  const [desktopPopupPrepTime, setDesktopPopupPrepTime] = useState(18)
  const [desktopPopupCountdown, setDesktopPopupCountdown] = useState(292)
  const [desktopPopupMuted, setDesktopPopupMuted] = useState(false)
  const shownDesktopPopupOrdersRef = useMemo(() => new Set(), [])

  const orderGroups = useMemo(
    () => ({
      requests: ["confirmed", "created"],
      preparing: ["pending", "preparing"],
      ready: ["ready", "ready_for_pickup"],
      picked: ["out_for_delivery", "delivered", "completed"],
    }),
    [],
  )

  const requestOrders = useMemo(
    () =>
      orders
        .filter((order) => orderGroups.requests.includes(normalizeStatus(order.status)))
        .sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0)),
    [orderGroups, orders],
  )

  const desktopPopupOrder = useMemo(
    () => requestOrders.find((order) => String(order._id || order.orderId) === String(desktopPopupOrderId)) || null,
    [desktopPopupOrderId, requestOrders],
  )

  useEffect(() => {
    if (desktopPopupOrder) return
    const nextPopupOrder = requestOrders.find((order) => {
      const key = String(order._id || order.orderId || "")
      return key && !shownDesktopPopupOrdersRef.has(key)
    })

    if (!nextPopupOrder) return

    const nextKey = String(nextPopupOrder._id || nextPopupOrder.orderId)
    shownDesktopPopupOrdersRef.add(nextKey)
    setDesktopPopupOrderId(nextKey)
    setDesktopPopupPrepTime(Number(nextPopupOrder.preparationTime || nextPopupOrder.estimatedPreparationTime || nextPopupOrder.etaMins || 18))
    setDesktopPopupCountdown(292)
  }, [desktopPopupOrder, requestOrders, shownDesktopPopupOrdersRef])

  useEffect(() => {
    if (!desktopPopupOrderId) return undefined
    const intervalId = setInterval(() => {
      setDesktopPopupCountdown((current) => (current > 0 ? current - 1 : 0))
    }, 1000)
    return () => clearInterval(intervalId)
  }, [desktopPopupOrderId])

  const closeDesktopPopup = useCallback(() => {
    setDesktopPopupOrderId("")
    setDesktopPopupCountdown(292)
  }, [])

  const handleAcceptOrder = useCallback(
    async (order, prepTime = 11) => {
      const orderId = order?._id || order?.orderId
      if (!orderId) return
      setActingOrderId(String(orderId))
      try {
        await restaurantAPI.acceptOrder(orderId, prepTime)
        await reloadOrders()
        if (String(orderId) === String(desktopPopupOrderId)) {
          closeDesktopPopup()
        }
      } finally {
        setActingOrderId("")
      }
    },
    [closeDesktopPopup, desktopPopupOrderId, reloadOrders],
  )

  const handleRejectOrder = useCallback(
    async (order) => {
      const orderId = order?._id || order?.orderId
      if (!orderId) return
      setActingOrderId(String(orderId))
      try {
        await restaurantAPI.rejectOrder(orderId, "Rejected from desktop order requests")
        await reloadOrders()
        if (String(orderId) === String(desktopPopupOrderId)) {
          closeDesktopPopup()
        }
      } finally {
        setActingOrderId("")
      }
    },
    [closeDesktopPopup, desktopPopupOrderId, reloadOrders],
  )

  const handleMarkReady = useCallback(
    async (order) => {
      const orderId = order?._id || order?.orderId
      if (!orderId) return
      setActingOrderId(String(orderId))
      try {
        await restaurantAPI.markOrderReady(orderId)
        await reloadOrders()
      } finally {
        setActingOrderId("")
      }
    },
    [reloadOrders],
  )

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => orderGroups[activeTab]?.includes(normalizeStatus(order.status)))
      .filter((order) => {
        if (!query.trim()) return true
        const haystack = [
          order.orderId,
          order._id,
          order.userId?.name,
          ...(order.items || []).map((item) => item?.name),
        ]
          .join(" ")
          .toLowerCase()
        return haystack.includes(query.trim().toLowerCase())
      })
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .slice(0, 8)
  }, [activeTab, orderGroups, orders, query])

  const desktopPopupTotals = useMemo(() => {
    if (!desktopPopupOrder) {
      return {
        subtotal: 0,
        packagingFee: 0,
        taxes: 0,
        discount: 0,
        total: 0,
      }
    }

    return {
      subtotal: firstFiniteNumber(desktopPopupOrder.pricing?.subtotal, desktopPopupOrder.pricing?.itemsTotal, desktopPopupOrder.subtotal, getOrderTotalValue(desktopPopupOrder)),
      packagingFee: firstFiniteNumber(desktopPopupOrder.pricing?.packagingFee, desktopPopupOrder.packagingFee),
      taxes: getOrderTaxValue(desktopPopupOrder),
      discount: getOrderDiscountValue(desktopPopupOrder),
      total: getOrderTotalValue(desktopPopupOrder),
    }
  }, [desktopPopupOrder])

  return (
    <RestaurantDesktopShell
      title="Orders"
      subtitle="Desktop preparing queue with compact live-order cards."
      toolbar={
        <>
          <DesktopStatPill active={activeTab === "requests"} onClick={() => setActiveTab("requests")}>
            Order requests ({orders.filter((order) => orderGroups.requests.includes(normalizeStatus(order.status))).length})
          </DesktopStatPill>
          <DesktopStatPill active={activeTab === "preparing"} onClick={() => setActiveTab("preparing")}>
            Preparing ({orders.filter((order) => orderGroups.preparing.includes(normalizeStatus(order.status))).length})
          </DesktopStatPill>
          <DesktopStatPill active={activeTab === "ready"} onClick={() => setActiveTab("ready")}>
            Ready ({orders.filter((order) => orderGroups.ready.includes(normalizeStatus(order.status))).length})
          </DesktopStatPill>
          <DesktopStatPill active={activeTab === "picked"} onClick={() => setActiveTab("picked")}>
            Picked up ({orders.filter((order) => orderGroups.picked.includes(normalizeStatus(order.status))).length})
          </DesktopStatPill>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-full max-w-[360px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b93a6]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by the 4 digit order ID"
              className="h-11 w-full rounded-xl border border-[#dce1eb] bg-white pl-11 pr-4 text-sm outline-none transition focus:border-[#8aa3f5]"
            />
          </div>
          <div className="rounded-xl border border-[#dce1eb] bg-white px-4 py-2 text-sm text-[#677085]">
            Placed at
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="rounded-[22px] border border-[#e5e8f0] bg-white p-10 text-center text-[#7b8498]">Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="rounded-[22px] border border-[#e5e8f0] bg-white p-10 text-center text-[#7b8498]">No orders match this desktop queue right now.</div>
          ) : (
            filteredOrders.map((order) => {
              const orderKey = String(order._id || order.orderId)
              const total = order?.pricing?.total || order?.total || 0
              const customer = order?.userId?.name || order?.customerName || "Customer"
              const items = Array.isArray(order?.items) ? order.items.slice(0, 3) : []
              const rider = order?.deliveryPartnerId?.name || order?.dispatch?.assignedTo?.name || "Delivery partner updating"
              const normalizedStatus = normalizeStatus(order.status)
              const isRequest = orderGroups.requests.includes(normalizedStatus)
              const isPreparing = orderGroups.preparing.includes(normalizedStatus)
              const isReady = orderGroups.ready.includes(normalizedStatus)
              const isPicked = orderGroups.picked.includes(normalizedStatus)
              const isActing = actingOrderId === orderKey
              const paymentLabel = order?.paymentMethod ? String(order.paymentMethod).toUpperCase() : "PAID"
              const photoUrl = order?.items?.[0]?.image || order?.items?.[0]?.photo || ""
              const photoAlt = order?.items?.[0]?.name || "Pizza"
              const orderLabel = order.orderId || String(order._id).slice(-6)
              const itemsSummary = items.length
                ? items.map((item) => `${item.quantity || 1}x ${item.name}`).join(", ")
                : "No items"
              const etaValue = Number(order?.preparationTime || order?.estimatedPreparationTime || order?.etaMins || 0)
              const etaLabel = etaValue > 0 ? `${etaValue} mins` : "--"
              const dispatchStatus = String(order?.dispatch?.status || "").toLowerCase()
              const showResendAction = (isPreparing || isReady) && dispatchStatus !== "accepted"
              const statusLabel = isPicked ? "PICKED UP" : isReady ? "READY" : isPreparing ? "PREPARING" : "ORDER"
              return (
                <article
                  key={orderKey}
                  className="relative overflow-hidden rounded-[22px] border border-[#e5e8f0] bg-white px-5 py-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)]"
                >
                  <div className="absolute left-0 top-0 h-full w-1 rounded-l-[22px] bg-[#1aa567]" />
                  <div className="flex items-start gap-4 pl-2">
                    <div className="mt-0.5 h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                      {photoUrl ? (
                        <img src={photoUrl} alt={photoAlt} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center p-1">
                          <span className="text-[9px] font-bold uppercase leading-none text-slate-300">
                            {photoAlt}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="truncate text-[15px] font-black text-slate-900">
                            #<span className="text-[#0f9d75]">{orderLabel}</span>
                          </h3>
                          <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-tight text-slate-400">
                            {customer}
                          </p>
                          <p className="mt-2 truncate text-[14px] font-bold text-slate-700">
                            {itemsSummary}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                              {statusLabel}
                            </span>
                            {isPreparing && (
                              <button
                                type="button"
                                onClick={() => handleRejectOrder(order)}
                                disabled={isActing}
                                className="rounded-full bg-rose-50 p-1.5 text-rose-500 disabled:opacity-50"
                                title="Cancel order"
                              >
                                {isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
                          <span className="text-[11px] font-bold uppercase tracking-tight text-slate-400">
                            Home Delivery
                          </span>
                        </div>
                      </div>

                      <div className="mt-6 flex items-end justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-end gap-1.5">
                            <span className="text-[10px] font-bold uppercase text-slate-400">ETA</span>
                            <span className="text-[24px] font-black leading-none text-slate-800">{etaLabel}</span>
                          </div>
                          <span className="text-[10px] font-bold uppercase text-slate-300">
                            {formatDateLabel(order.createdAt)}, {formatTimeLabel(order.createdAt)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {!isRequest && (
                            <>
                              {order?.deliveryPartnerId ? (
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600" title={rider}>
                                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </div>
                              ) : isPreparing ? (
                                <div className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-[9px] font-black uppercase tracking-tight text-slate-400">
                                  No Rider
                                </div>
                              ) : null}

                              {showResendAction && (
                                <ResendNotificationButton
                                  orderId={order.orderId}
                                  mongoId={order._id}
                                  onSuccess={reloadOrders}
                                />
                              )}
                            </>
                          )}

                          {isRequest ? (
                            <>
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleRejectOrder(order)}
                                className="rounded-xl border border-[#f2c3c3] px-4 py-2 text-[11px] font-black text-[#d55252] disabled:opacity-60"
                              >
                                {isActing ? "..." : "REJECT"}
                              </button>
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleAcceptOrder(order)}
                                className="rounded-xl bg-[#4771ea] px-4 py-2 text-[11px] font-black text-white disabled:opacity-60"
                              >
                                {isActing ? "..." : "ACCEPT"}
                              </button>
                            </>
                          ) : isPreparing ? (
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => handleMarkReady(order)}
                              className="rounded-xl bg-[#16a34a] px-4 py-2 text-[11px] font-black text-white disabled:opacity-60"
                            >
                              {isActing ? "..." : "MARK READY"}
                            </button>
                          ) : (
                            <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-tight text-slate-400">
                              {isPicked ? "Out For Delivery" : "Ready"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </div>

      {desktopPopupOrder ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-6">
          <div className="w-full max-w-[580px] overflow-hidden rounded-[18px] border border-[#dfe5ef] bg-white shadow-[0_22px_80px_rgba(15,23,42,0.24)]">
            <div className="flex items-center justify-between border-b border-[#e9edf3] px-5 py-4">
              <p className="text-[22px] font-semibold text-[#252b36]">1 new order</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDesktopPopupMuted((current) => !current)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#80a8ff] px-3 py-1.5 text-sm font-semibold text-[#3972ff]"
                >
                  {desktopPopupMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  {desktopPopupMuted ? "Unmute" : "Mute"}
                </button>
                <button
                  type="button"
                  onClick={closeDesktopPopup}
                  className="text-[#70798c] transition hover:text-[#252b36]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-5">
              <div className="rounded-[6px] bg-[#dccfff] px-4 py-2 text-[11px] font-black uppercase tracking-[0.28em] text-[#6b59bf]">
                Zomato delivery
              </div>

              <div className="mt-4 flex items-start justify-between gap-4 border-b border-[#edf1f6] pb-3">
                <div>
                  <p className="text-[18px] font-semibold text-[#2a3240]">
                    ID: {desktopPopupOrder.orderId || String(desktopPopupOrder._id).slice(-6)}
                    <span className="ml-2 text-[16px] font-medium text-[#4d5565]">| {formatTimeLabel(desktopPopupOrder.createdAt)}</span>
                  </p>
                </div>
                <p className="text-sm text-[#6e7688]">
                  1st order by {desktopPopupOrder.userId?.name || desktopPopupOrder.customerName || "Customer"}
                </p>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#2f9a5e]">
                <UtensilsCrossed className="h-4 w-4" />
                <span>{desktopPopupOrder.sendCutlery === false ? "Don't send cutlery" : "Send cutlery"}</span>
              </div>

              <div className="mt-4 space-y-3 border-b border-[#edf1f6] pb-4">
                {(desktopPopupOrder.items || []).map((item, index) => (
                  <div key={`${desktopPopupOrder._id || desktopPopupOrder.orderId}-${item.name}-${index}`} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-[18px] text-[#2b3343]">
                      <span className={`inline-block h-3 w-3 rounded-sm border ${item.isVeg ? "border-[#36b164]" : "border-[#ef4444]"}`} />
                      <span>{item.quantity || 1} x {item.name}</span>
                    </div>
                    <span className="text-[18px] font-medium text-[#4f5667]">{currency((item.price || 0) * (item.quantity || 1))}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-b border-[#edf1f6] py-4 text-[16px] text-[#596275]">
                <div className="flex items-center justify-between">
                  <span>{(desktopPopupOrder.items || []).length} item{(desktopPopupOrder.items || []).length === 1 ? "" : "s"}</span>
                  <span>{currency(desktopPopupTotals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Restaurant Packaging Charges</span>
                  <span>{currency(desktopPopupTotals.packagingFee)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Taxes</span>
                  <span>{currency(desktopPopupTotals.taxes)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Discount</span>
                  <span>-{currency(desktopPopupTotals.discount)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-[#edf1f6] py-4">
                <div className="flex items-center gap-2 text-[24px] font-semibold text-[#2a3240]">
                  <span>Total Bill</span>
                  <span className="rounded border border-[#78cbe8] bg-[#effcff] px-2 py-0.5 text-[14px] font-bold text-[#2994c8]">
                    {getOrderPaymentStatusLabel(desktopPopupOrder)}
                  </span>
                </div>
                <span className="text-[26px] font-bold text-[#2a3240]">{currency(desktopPopupTotals.total)}</span>
              </div>

              <div className="py-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[17px] font-medium text-[#495263]">Set food preparation time</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-[#b9ccff] px-2 py-1 text-[11px] font-semibold text-[#4771ea]">KOT</span>
                    <span className="rounded-md border border-[#b9ccff] px-2 py-1 text-[11px] font-semibold text-[#4771ea]">ORDER</span>
                  </div>
                </div>

                <div className="grid grid-cols-[90px_1fr_90px] overflow-hidden rounded-[10px] border border-[#cfd7e6]">
                  <button
                    type="button"
                    onClick={() => setDesktopPopupPrepTime((current) => Math.max(1, current - 1))}
                    className="flex h-12 items-center justify-center text-[#3972ff]"
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                  <div className="flex h-12 items-center justify-center border-x border-[#cfd7e6] text-[18px] font-medium text-[#2a3240]">
                    {desktopPopupPrepTime} mins
                  </div>
                  <button
                    type="button"
                    onClick={() => setDesktopPopupPrepTime((current) => current + 1)}
                    className="flex h-12 items-center justify-center text-[#3972ff]"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-4 border-t border-[#edf1f6] px-5 py-4">
              <button
                type="button"
                onClick={() => handleRejectOrder(desktopPopupOrder)}
                disabled={actingOrderId === String(desktopPopupOrder._id || desktopPopupOrder.orderId)}
                className="flex-1 rounded-[10px] border border-[#ff8f8f] bg-white py-3 text-[18px] font-medium text-[#ef4444] disabled:opacity-60"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => handleAcceptOrder(desktopPopupOrder, desktopPopupPrepTime)}
                disabled={actingOrderId === String(desktopPopupOrder._id || desktopPopupOrder.orderId)}
                className="flex-[1.6] rounded-[10px] bg-[#2f9a3d] py-3 text-[18px] font-semibold text-white disabled:opacity-60"
              >
                {actingOrderId === String(desktopPopupOrder._id || desktopPopupOrder.orderId)
                  ? "Accepting..."
                  : `Accept order (${formatCountdownLabel(desktopPopupCountdown)})`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </RestaurantDesktopShell>
  )
}

export function DesktopMenuView() {
  const sections = useRestaurantMenuSections()

  const menuStats = useMemo(() => {
    const items = sections.flatMap((section) => [
      ...(Array.isArray(section?.items) ? section.items : []),
      ...(Array.isArray(section?.subsections)
        ? section.subsections.flatMap((subsection) => subsection?.items || [])
        : []),
    ])
    const total = items.length
    const withImages = items.filter((item) => item?.image || item?.photoCount > 0).length
    const withDescriptions = items.filter((item) => String(item?.description || "").trim()).length
    const withPricing = items.filter((item) => Number(item?.price || item?.basePrice || 0) > 0).length
    const score = total > 0 ? Math.round(((withImages + withDescriptions + withPricing) / (total * 3)) * 100) : 80
    return {
      total,
      score: Math.max(score, total === 0 ? 80 : score),
      withImages,
      missingImages: Math.max(total - withImages, 0),
      missingDescriptions: Math.max(total - withDescriptions, 0),
      pricingReady: withPricing,
    }
  }, [sections])

  const insightCards = [
    { title: "Simplify your menu structure", body: "Organize categories to mirror how guests actually order on desktop.", icon: CalendarDays },
    { title: "Add photos of your top selling items", body: `${menuStats.missingImages} items still need gallery-ready images.`, icon: Camera },
    { title: "Most of your items have descriptions", body: `${menuStats.missingDescriptions} items can be improved with short taste-forward copy.`, icon: ImageIcon },
    { title: "Add relevant add-ons to boost love", body: "Bundle beverages, extras, and upsells where they fit naturally.", icon: UtensilsCrossed },
  ]

  return (
    <RestaurantDesktopShell title="Menu" subtitle="A Zomato-inspired desktop view for catalog operations.">
      <div className="grid grid-cols-[1.75fr_0.85fr] gap-5">
        <section className="overflow-hidden rounded-[24px] border border-[#e5e8f0] bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-start justify-between border-b border-[#edf0f5] px-6 py-6">
            <div>
              <h2 className="text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#2a3240]">Your menu score is good</h2>
              <p className="mt-2 text-[15px] text-[#677085]">Top restaurants in your area keep descriptions, images, and add-ons consistently polished.</p>
              <p className="mt-2 text-xs text-[#98a1b3]">Updated from {menuStats.total || 0} items currently in your catalog.</p>
            </div>
            <div className="grid h-28 w-28 place-items-center rounded-full border-[10px] border-[#f4c524] border-b-[#edf0f5] border-l-[#f4c524] text-[18px] font-bold text-[#1f2735]">
              {menuStats.score}%
            </div>
          </div>

          <div className="px-6 py-5">
            <p className="mb-4 text-sm font-semibold text-[#384152]">Top opportunities to grow your business</p>
            <div className="grid grid-cols-2 gap-4">
              {insightCards.map((card) => {
                const Icon = card.icon
                return (
                  <div key={card.title} className="rounded-2xl border border-[#e7ebf4] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[17px] font-semibold leading-snug text-[#2a3240]">{card.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-[#687185]">{card.body}</p>
                        <button type="button" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#4c73e8]">
                          View insights <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                      <Icon className="h-10 w-10 text-[#c0c7d8]" />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="mx-6 mb-6 rounded-2xl bg-[#e9eeff] px-5 py-4 text-sm font-medium text-[#4a5e97]">
            Your menu tool has a new desktop layout. Use it to prioritize images, descriptions, and pricing gaps faster.
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[24px] border border-[#e5e8f0] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-[28px] font-bold tracking-[-0.04em] text-[#2a3240]">Go to Menu Editor</h3>
                <p className="mt-2 text-sm leading-6 text-[#6b7386]">Edit items, tax slabs, availability, and visuals with your desktop workflow.</p>
              </div>
              <ArrowRight className="mt-1 h-5 w-5 text-[#1d2433]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[24px] border border-[#e5e8f0] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
              <div className="flex items-start justify-between">
                <h3 className="max-w-[110px] text-[24px] font-bold leading-tight tracking-[-0.04em] text-[#2a3240]">Request photoshoot</h3>
                <Camera className="h-7 w-7 text-[#f2994a]" />
              </div>
            </div>
            <div className="rounded-[24px] border border-[#e5e8f0] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
              <div className="flex items-start justify-between">
                <h3 className="max-w-[110px] text-[24px] font-bold leading-tight tracking-[-0.04em] text-[#2a3240]">Add videos on menu</h3>
                <ImageIcon className="h-7 w-7 text-[#4c73e8]" />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </RestaurantDesktopShell>
  )
}

export function DesktopOrderHistoryView() {
  const { orders, loading } = useRestaurantOrders()
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState("")

  const historyOrders = useMemo(
    () =>
      orders
        .slice()
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .filter((order) => {
          if (!query.trim()) return true
          const haystack = `${order.orderId || ""} ${order.userId?.name || ""} ${(order.items || []).map((item) => item?.name).join(" ")}`
          return haystack.toLowerCase().includes(query.trim().toLowerCase())
        }),
    [orders, query],
  )

  useEffect(() => {
    if (!selectedId && historyOrders[0]) {
      setSelectedId(historyOrders[0]._id || historyOrders[0].orderId)
    }
  }, [historyOrders, selectedId])

  const selectedOrder = useMemo(
    () => historyOrders.find((order) => String(order._id || order.orderId) === String(selectedId)) || null,
    [historyOrders, selectedId],
  )

  return (
    <RestaurantDesktopShell
      title="Order History"
      toolbar={
        <>
          <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-[#dce1eb] bg-white px-4 py-2 text-sm font-medium text-[#5b6578]">
            <CalendarDays className="h-4 w-4" />
            24th to 25th Apr
          </button>
          <button type="button" className="rounded-xl border border-[#dce1eb] bg-white px-4 py-2 text-sm font-medium text-[#5b6578]">
            Filter
          </button>
          <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-[#dce1eb] bg-white px-4 py-2 text-sm font-medium text-[#5b6578]">
            <Download className="h-4 w-4" />
            Download data
          </button>
        </>
      }
    >
      <div className="grid grid-cols-[360px_1fr] overflow-hidden rounded-[24px] border border-[#e5e8f0] bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
        <div className="border-r border-[#edf0f5]">
          <div className="border-b border-[#edf0f5] p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b93a6]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Enter full order ID to search"
                className="h-11 w-full rounded-xl border border-[#dce1eb] bg-white pl-11 pr-4 text-sm outline-none transition focus:border-[#8aa3f5]"
              />
            </div>
          </div>
          <div className="max-h-[720px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-[#7b8498]">Loading order history...</div>
            ) : historyOrders.length === 0 ? (
              <div className="p-8 text-center text-[#7b8498]">No order selected</div>
            ) : (
              historyOrders.map((order) => {
                const active = String(order._id || order.orderId) === String(selectedId)
                return (
                  <button
                    key={order._id || order.orderId}
                    type="button"
                    onClick={() => setSelectedId(order._id || order.orderId)}
                    className={`w-full border-b border-[#edf0f5] px-4 py-4 text-left transition ${active ? "bg-[#edf3ff]" : "hover:bg-[#f8f9fc]"}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-bold ${active ? "bg-[#6d78d6] text-white" : "bg-[#e7efff] text-[#4766c8]"}`}>
                          {String(order.status || "preparing").replace(/_/g, " ").toUpperCase()}
                        </span>
                        <p className="mt-3 text-sm font-semibold text-[#2b3343]">ID: {order.orderId || String(order._id).slice(-10)}</p>
                      </div>
                      <div className="text-right text-xs text-[#7b8498]">
                        <p>{formatTimeLabel(order.createdAt)}</p>
                        <p>{formatDateLabel(order.createdAt)}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-[#7b8498]">By {order.userId?.name || order.customerName || "Customer"}</p>
                    <div className="mt-3 flex items-center justify-between gap-4 text-sm text-[#596275]">
                      <span className="line-clamp-1">{(order.items || []).map((item) => `${item.quantity || 1} x ${item.name}`).join(", ") || "No items"}</span>
                      <span className="font-semibold text-[#2b3343]">{currency(order.pricing?.total || order.total || 0)}</span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="bg-[#fcfdff]">
          {!selectedOrder ? (
            <div className="grid h-full place-items-center text-center text-[#7b8498]">
              <div>
                <UtensilsCrossed className="mx-auto h-10 w-10 text-[#d4d9e4]" />
                <p className="mt-4 text-lg font-medium text-[#576074]">No order selected</p>
              </div>
            </div>
          ) : (
            <>
              {(() => {
                const selectedTimelineSteps = getOrderTimelineSteps(selectedOrder)
                const selectedPaymentStatus = getOrderPaymentStatusLabel(selectedOrder)
                const selectedTaxValue = getOrderTaxValue(selectedOrder)
                const selectedDiscountValue = getOrderDiscountValue(selectedOrder)
                const selectedCustomerName = selectedOrder.userId?.name || selectedOrder.customerName || "Customer"
                const selectedCustomerOrderCount = Number(selectedOrder.userId?.orderCount || selectedOrder.customer?.orderCount || 0)
                const customerOrderLabel = selectedCustomerOrderCount > 0 ? `${selectedCustomerOrderCount}${selectedCustomerOrderCount === 1 ? "st" : selectedCustomerOrderCount === 2 ? "nd" : selectedCustomerOrderCount === 3 ? "rd" : "th"} order` : "Order"
                const deliveryPartnerName =
                  selectedOrder.deliveryPartnerId?.name ||
                  selectedOrder.dispatch?.assignedTo?.name ||
                  selectedOrder.dispatch?.deliveryPartnerName ||
                  ""

                return (
                  <>
              <div className="flex items-start justify-between border-b border-[#edf0f5] px-6 py-5">
                <div>
                  <p className="text-[24px] font-bold tracking-[-0.03em] text-[#2b3343]">ID: {selectedOrder.orderId || String(selectedOrder._id).slice(-10)}</p>
                  <span className="mt-3 inline-flex rounded-md bg-[#6d78d6] px-2 py-1 text-[11px] font-bold text-white">
                    {String(selectedOrder.status || "preparing").replace(/_/g, " ").toUpperCase()}
                  </span>
                </div>
                <div className="text-right text-sm text-[#6b7386]">
                  <p>{formatTimeLabel(selectedOrder.createdAt)} | {formatDateLabel(selectedOrder.createdAt)}</p>
                  <p className="mt-2">{customerOrderLabel} by {selectedCustomerName}</p>
                </div>
              </div>

              <div className="border-b border-[#edf0f5] px-6 py-6">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.24em] text-[#6d7488]">
                  <span>Order timeline</span>
                  <span>{formatRelativePlacedLabel(selectedOrder.createdAt)}</span>
                </div>
                <div className="mt-8 grid grid-cols-3 items-center gap-4">
                  {selectedTimelineSteps.map((step, index) => (
                    <div key={step.label} className="relative text-center">
                      {index < 2 ? <div className="absolute left-1/2 top-3 h-[2px] w-full bg-[#cfd7e7]" /> : null}
                      <div className={`relative mx-auto grid h-6 w-6 place-items-center rounded-full border-2 ${step.active ? "border-[#41b36d] bg-[#e8f7ee]" : "border-[#cfd7e7] bg-white"}`}>
                        <div className={`h-2.5 w-2.5 rounded-full ${step.active ? "bg-[#41b36d]" : "bg-[#cfd7e7]"}`} />
                      </div>
                      <p className="mt-4 text-sm font-medium text-[#5f6778]">{step.label}</p>
                      <p className="text-sm font-semibold text-[#2b3343]">{step.time}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-6 py-6">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6d7488]">Order details</h3>
                  <div className="flex gap-2">
                    <span className="rounded-md border border-[#b9ccff] px-2 py-1 text-[11px] font-semibold text-[#4771ea]">KOT</span>
                    <span className="rounded-md border border-[#b9ccff] px-2 py-1 text-[11px] font-semibold text-[#4771ea]">ORDER</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {(selectedOrder.items || []).map((item) => (
                    <div key={`${selectedOrder._id}-${item.name}`} className="flex items-center justify-between border-b border-dashed border-[#e8ebf2] pb-3 text-[15px] text-[#2b3343]">
                      <span>{item.quantity || 1} x {item.name}</span>
                      <span>{currency(item.price || 0)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 space-y-2 text-sm text-[#6d7488]">
                  <div className="flex items-center justify-between"><span>Taxes</span><span>{currency(selectedTaxValue)}</span></div>
                  <div className="flex items-center justify-between"><span>Discount</span><span>-{currency(selectedDiscountValue)}</span></div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#edf0f5] pt-4 text-[18px] font-semibold text-[#2b3343]">
                  <span>Total Bill <span className="ml-2 rounded-md bg-[#dbf5e8] px-2 py-0.5 text-[11px] text-[#209663]">{selectedPaymentStatus}</span></span>
                  <span>{currency(selectedOrder.pricing?.total || selectedOrder.total || 0)}</span>
                </div>

                <div className="mt-6 flex items-center justify-between rounded-2xl border border-[#e7ebf4] bg-white p-4">
                  <div>
                    <p className="text-sm font-semibold text-[#2b3343]">
                      {deliveryPartnerName ? `${deliveryPartnerName} is on the way` : "Delivery partner updates will appear here"}
                    </p>
                    <p className="mt-1 text-xs text-[#7b8498]">
                      {deliveryPartnerName ? "Delivery details and support actions stay visible here." : "Assign a rider to show live delivery details for this order."}
                    </p>
                  </div>
                  <Truck className="h-6 w-6 text-[#4f78ee]" />
                </div>
              </div>
                  </>
                )
              })()}
            </>
          )}
        </div>
      </div>
    </RestaurantDesktopShell>
  )
}

export function DesktopComplaintsView() {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState("")

  useEffect(() => {
    let isMounted = true

    const loadComplaints = async () => {
      try {
        setLoading(true)
        const params = { limit: 100 }
        if (query.trim()) params.search = query.trim()
        const response = await restaurantAPI.getComplaints(params)
        const nextComplaints = response?.data?.data?.complaints || []
        if (!isMounted) return
        setComplaints(Array.isArray(nextComplaints) ? nextComplaints : [])
      } catch {
        if (isMounted) {
          setComplaints([])
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadComplaints()
    return () => {
      isMounted = false
    }
  }, [query])

  useEffect(() => {
    if (!selectedId && complaints[0]) {
      setSelectedId(complaints[0]._id)
    }
  }, [complaints, selectedId])

  const selectedComplaint = useMemo(
    () => complaints.find((complaint) => String(complaint._id) === String(selectedId)) || null,
    [complaints, selectedId],
  )

  return (
    <RestaurantDesktopShell
      title="Customer complaints"
      toolbar={
        <>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-[#dce1eb] bg-white px-4 py-2 text-sm font-medium text-[#5b6578]"
          >
            <CalendarDays className="h-4 w-4" />
            Last 30 days
          </button>
          <button
            type="button"
            className="rounded-xl border border-[#dce1eb] bg-white px-4 py-2 text-sm font-medium text-[#5b6578]"
          >
            Filter
          </button>
        </>
      }
    >
      <div className="grid grid-cols-[360px_1fr] overflow-hidden rounded-[24px] border border-[#e5e8f0] bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
        <div className="border-r border-[#edf0f5]">
          <div className="border-b border-[#edf0f5] p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b93a6]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search complaints"
                className="h-11 w-full rounded-xl border border-[#dce1eb] bg-white pl-11 pr-4 text-sm outline-none transition focus:border-[#8aa3f5]"
              />
            </div>
          </div>

          <div className="max-h-[720px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-[#7b8498]">Loading complaints...</div>
            ) : complaints.length === 0 ? (
              <div className="p-8 text-center text-[#7b8498]">No complaints found.</div>
            ) : (
              complaints.map((complaint) => {
                const active = String(complaint._id) === String(selectedId)
                const order = complaint.orderId || {}
                const itemSummary = Array.isArray(order?.items)
                  ? order.items.map((item) => `${item.quantity || 1} x ${item.name}`).join(", ")
                  : ""

                return (
                  <button
                    key={complaint._id}
                    type="button"
                    onClick={() => setSelectedId(complaint._id)}
                    className={`w-full border-b border-[#edf0f5] px-4 py-4 text-left transition ${
                      active ? "bg-[#edf3ff]" : "hover:bg-[#f8f9fc]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#2b3343]">
                        {complaint.subject || formatIssueLabel(complaint.issueType)}
                      </p>
                      <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${getComplaintStatusTone(complaint.status)}`}>
                        {formatStatusLabel(complaint.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#7b8498]">
                      ID: {order?.orderId || order?._id || "N/A"}
                    </p>
                    {itemSummary ? (
                      <p className="mt-2 line-clamp-2 text-xs font-medium text-[#4c5568]">{itemSummary}</p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-[#5b6578]">
                      {complaint.userId?.name || "Customer"}
                    </p>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="bg-[#fcfdff]">
          {!selectedComplaint ? (
            <div className="grid h-full place-items-center text-center text-[#7b8498]">
              <div>
                <MessageSquare className="mx-auto h-10 w-10 text-[#d4d9e4]" />
                <p className="mt-4 text-lg font-medium text-[#576074]">No complaint selected</p>
              </div>
            </div>
          ) : (
            (() => {
              const order = selectedComplaint.orderId || {}
              const customerName = selectedComplaint.userId?.name || "Customer"
              const customerOrders = selectedComplaint.userId?.orderCount || order?.userId?.orderCount || 0
              const customerLocation =
                selectedComplaint.restaurantId?.address ||
                order?.deliveryAddress?.address ||
                order?.address?.address ||
                selectedComplaint.restaurantId?.restaurantName ||
                "Location unavailable"
              const refundAmount = firstFiniteNumber(
                selectedComplaint.refundAmount,
                selectedComplaint.resolution?.refundAmount,
                selectedComplaint.compensation?.amount,
              )
              const orderItemCount = Array.isArray(order?.items)
                ? order.items.reduce((sum, item) => sum + Number(item?.quantity || 1), 0)
                : 0
              const orderAmount = firstFiniteNumber(order?.pricing?.total, order?.total, order?.payment?.amountDue)

              return (
                <>
                  <div className="flex items-start justify-between border-b border-[#edf0f5] px-6 py-5">
                    <div>
                      <p className="text-[24px] font-bold tracking-[-0.03em] text-[#2b3343]">
                        {selectedComplaint.subject || formatIssueLabel(selectedComplaint.issueType)}
                      </p>
                      <span className={`mt-3 inline-flex rounded-md px-2 py-1 text-[11px] font-bold uppercase ${getComplaintStatusTone(selectedComplaint.status)}`}>
                        {formatStatusLabel(selectedComplaint.status)}
                      </span>
                    </div>
                    <div className="text-right text-sm text-[#6b7386]">
                      <p>
                        {formatTimeLabel(selectedComplaint.createdAt)} | {formatDateLabel(selectedComplaint.createdAt)}
                      </p>
                      <p className="mt-2">Order ID: {order?.orderId || order?._id || "N/A"}</p>
                    </div>
                  </div>

                  <div className="px-6 py-6">
                    <p className="text-sm text-[#7b8498]">
                      {selectedComplaint.restaurantId?.restaurantName || "Restaurant"}
                    </p>

                    <div className="mt-5 flex items-start gap-4">
                      <div className="grid h-11 w-11 place-items-center rounded-full bg-[#dd6b20] text-sm font-bold text-white">
                        {String(customerName).trim().charAt(0).toUpperCase() || "C"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-semibold text-[#2b3343]">{customerName}</p>
                          <span className="rounded-full bg-[#f8e6d6] px-2 py-0.5 text-[10px] font-bold uppercase text-[#9c5814]">
                            Premium
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[#4c5568]">
                          Complaint for {orderItemCount || 1} item{orderItemCount === 1 ? "" : "s"}
                          {orderAmount > 0 ? `: ${currency(orderAmount)}` : ""}
                        </p>
                        <button
                          type="button"
                          className="mt-2 text-sm font-semibold text-[#3972ff]"
                        >
                          Order details
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-[#e8edf5] bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#d2555d]">
                        {formatIssueLabel(selectedComplaint.issueType)}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#2f3747]">
                        {selectedComplaint.description || "No complaint details available."}
                      </p>
                    </div>

                    <div className="mt-5 rounded-2xl border border-[#e6f1ff] bg-[#f8fbff] p-4">
                      <p className="text-sm font-semibold text-[#2774b8]">Verified complaint</p>
                      <div className="mt-3 space-y-2 text-sm text-[#5f6778]">
                        <p>{formatOrderCountLabel(customerOrders)}</p>
                        <p>{customerLocation}</p>
                        {selectedComplaint.adminResponse ? <p>Resolution: {selectedComplaint.adminResponse}</p> : null}
                        {selectedComplaint.restaurantResponse ? <p>Restaurant response: {selectedComplaint.restaurantResponse}</p> : null}
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-[#dde8ff] bg-[#f4f7ff] px-4 py-4 text-sm font-semibold text-[#395fa8]">
                      {refundAmount > 0
                        ? `Refund of ${currency(refundAmount)} given`
                        : `Current status: ${formatStatusLabel(selectedComplaint.status)}`}
                    </div>
                  </div>
                </>
              )
            })()
          )}
        </div>
      </div>
    </RestaurantDesktopShell>
  )
}

export function DesktopReviewsView() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState("")
  const [replyDraft, setReplyDraft] = useState("")
  const [restaurantName, setRestaurantName] = useState("Restaurant")

  useEffect(() => {
    let isMounted = true

    const loadReviews = async () => {
      try {
        setLoading(true)
        let page = 1
        let hasMore = true
        const limit = 100
        const allOrders = []

        while (hasMore && page <= 20) {
          const response = await restaurantAPI.getOrders({ page, limit, status: "delivered" })
          const nextOrders = response?.data?.data?.orders || []
          allOrders.push(...nextOrders)

          const totalPages =
            response?.data?.data?.pagination?.totalPages ||
            response?.data?.data?.totalPages ||
            1

          if (nextOrders.length < limit || page >= totalPages) {
            hasMore = false
          } else {
            page += 1
          }
        }

        const restaurantResponse = await restaurantAPI.getCurrentRestaurant()
        const currentRestaurant =
          restaurantResponse?.data?.data?.restaurant ||
          restaurantResponse?.data?.restaurant ||
          null

        if (!isMounted) return
        setRestaurantName(currentRestaurant?.name || "Restaurant")

        const transformed = allOrders
          .map((order, index) => {
            const rating = extractReviewRating(order)
            const reviewText = extractReviewText(order)
            if (rating === null && !reviewText) return null

            const userName = order.userId?.name || order.customerName || "Customer"
            const userOrdersCount = allOrders.filter((candidate) => toComparableId(candidate.userId) === toComparableId(order.userId)).length

            return {
              id: order._id || order.orderId || `review-${index}`,
              orderId: order.orderId || order._id,
              outlet: order.restaurantName || currentRestaurant?.name || "Restaurant",
              date: order.createdAt || order.deliveredAt,
              userName,
              rating,
              reviewText,
              items: Array.isArray(order.items) ? order.items : [],
              ordersCount: userOrdersCount,
            }
          })
          .filter(Boolean)

        setReviews(transformed)
      } catch {
        if (isMounted) {
          setReviews([])
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadReviews()
    return () => {
      isMounted = false
    }
  }, [])

  const filteredReviews = useMemo(
    () =>
      reviews.filter((review) => {
        if (!query.trim()) return true
        const haystack = `${review.userName} ${review.reviewText} ${review.orderId} ${review.items.map((item) => item?.name).join(" ")}`
        return haystack.toLowerCase().includes(query.trim().toLowerCase())
      }),
    [query, reviews],
  )

  useEffect(() => {
    if (!selectedId && filteredReviews[0]) {
      setSelectedId(filteredReviews[0].id)
    }
  }, [filteredReviews, selectedId])

  const selectedReview = useMemo(
    () => filteredReviews.find((review) => String(review.id) === String(selectedId)) || null,
    [filteredReviews, selectedId],
  )

  useEffect(() => {
    setReplyDraft("")
  }, [selectedId])

  return (
    <RestaurantDesktopShell
      title="Customer reviews"
      toolbar={
        <>
          <button
            type="button"
            className="rounded-xl border border-[#dce1eb] bg-white px-4 py-2 text-sm font-medium text-[#5b6578]"
          >
            Detailed reviews
          </button>
          <button
            type="button"
            className="rounded-xl border border-[#dce1eb] bg-white px-4 py-2 text-sm font-medium text-[#5b6578]"
          >
            Filter
          </button>
        </>
      }
    >
      <div className="grid grid-cols-[360px_1fr] overflow-hidden rounded-[24px] border border-[#e5e8f0] bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
        <div className="border-r border-[#edf0f5]">
          <div className="border-b border-[#edf0f5] p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b93a6]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search reviews"
                className="h-11 w-full rounded-xl border border-[#dce1eb] bg-white pl-11 pr-4 text-sm outline-none transition focus:border-[#8aa3f5]"
              />
            </div>
          </div>

          <div className="max-h-[720px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-[#7b8498]">Loading reviews...</div>
            ) : filteredReviews.length === 0 ? (
              <div className="p-8 text-center text-[#7b8498]">No reviews found.</div>
            ) : (
              filteredReviews.map((review) => {
                const active = String(review.id) === String(selectedId)
                return (
                  <button
                    key={review.id}
                    type="button"
                    onClick={() => setSelectedId(review.id)}
                    className={`w-full border-b border-[#edf0f5] px-4 py-4 text-left transition ${
                      active ? "bg-[#edf3ff]" : "hover:bg-[#f8f9fc]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#2b3343]">{review.userName}</p>
                        <p className="text-xs text-[#7b8498]">{formatOrderCountLabel(review.ordersCount)}</p>
                      </div>
                      <div className="rounded bg-[#ef7c3b] px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {review.rating ?? "-"}
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-[#4c5568]">{review.reviewText || "No review text"}</p>
                    <p className="mt-3 text-[11px] font-semibold text-[#3972ff]">View review details</p>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="flex min-h-[720px] flex-col bg-[#fcfdff]">
          {!selectedReview ? (
            <div className="grid flex-1 place-items-center text-center text-[#7b8498]">
              <div>
                <Star className="mx-auto h-10 w-10 text-[#d4d9e4]" />
                <p className="mt-4 text-lg font-medium text-[#576074]">No review selected</p>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-[#edf0f5] px-6 py-5">
                <p className="text-sm font-semibold text-[#2b3343]">{selectedReview.outlet || restaurantName}</p>
                <p className="mt-1 text-sm text-[#6b7386]">
                  {formatDateLabel(selectedReview.date)} {selectedReview.orderId ? `| Order ID: ${selectedReview.orderId}` : ""}
                </p>
              </div>

              <div className="border-b border-[#edf0f5] px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-[#e8ebf7] text-sm font-bold text-[#6b7386]">
                    {String(selectedReview.userName).trim().charAt(0).toUpperCase() || "C"}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#2b3343]">{selectedReview.userName}</p>
                    <p className="text-xs text-[#6b7386]">{formatOrderCountLabel(selectedReview.ordersCount)}</p>
                  </div>
                  <div className="ml-auto rounded bg-[#ef7c3b] px-2 py-0.5 text-[10px] font-bold text-white">
                    {selectedReview.rating ?? "-"}★
                  </div>
                </div>
              </div>

              <div className="flex-1 px-6 py-5">
                <div className="rounded-2xl border border-[#edf0f5] bg-white p-4">
                  <p className="text-sm font-semibold leading-6 text-[#2f3747]">
                    {selectedReview.reviewText || "No review text shared by the customer."}
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  {selectedReview.items.map((item, index) => (
                    <div
                      key={`${selectedReview.id}-${item.name}-${index}`}
                      className="flex items-center justify-between rounded-xl border border-[#edf0f5] bg-white px-4 py-3"
                    >
                      <span className="text-sm font-medium text-[#2b3343]">{item.name}</span>
                      <span className="rounded border border-[#f0cf7a] bg-[#fff9e7] px-1.5 py-0.5 text-[10px] font-bold text-[#b6860a]">
                        {item.quantity || 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-[#edf0f5] px-6 py-4">
                <div className="flex items-center gap-3 rounded-2xl border border-[#e5e8f0] bg-white px-4 py-3">
                  <input
                    value={replyDraft}
                    onChange={(event) => setReplyDraft(event.target.value)}
                    placeholder="Type your reply here"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                  <button
                    type="button"
                    disabled={!replyDraft.trim()}
                    className="grid h-8 w-8 place-items-center rounded-full bg-[#d9dde7] text-white disabled:cursor-not-allowed disabled:bg-[#d9dde7]"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </RestaurantDesktopShell>
  )
}

export function DesktopOffersView() {
  const navigate = useNavigate()
  const { offers, restaurantName, loading: offersLoading } = useRestaurantOffers()
  const { orders, loading: ordersLoading } = useRestaurantOrders()
  const [range, setRange] = useState("daily")
  const [activeSection, setActiveSection] = useState("track")
  const [campaignFilter, setCampaignFilter] = useState("all")
  const [copiedCode, setCopiedCode] = useState("")

  const offerCollections = useMemo(() => {
    const activeOffers = offers.filter((offer) => String(offer?.status || "active").toLowerCase() === "active")
    const scheduledOffers = offers.filter((offer) => String(offer?.status || "").toLowerCase() === "scheduled")
    const inactiveOffers = offers.filter((offer) => !["active", "scheduled"].includes(String(offer?.status || "").toLowerCase()))

    return {
      active: activeOffers,
      scheduled: scheduledOffers,
      inactive: inactiveOffers,
      all: offers,
    }
  }, [offers])

  useEffect(() => {
    if (!copiedCode) return undefined
    const timeoutId = window.setTimeout(() => setCopiedCode(""), 1800)
    return () => window.clearTimeout(timeoutId)
  }, [copiedCode])

  const metrics = useMemo(() => {
    const { start, end, previousStart, previousEnd } = getRangeWindow(range)
    const normalizedOffers = offers.map((offer) => ({
      offer,
      couponCode: String(offer?.couponCode || "").trim().toUpperCase(),
    }))
    const offerCodeSet = new Set(normalizedOffers.map(({ couponCode }) => couponCode).filter(Boolean))

    const summarizeWindow = (windowStart, windowEnd) => {
      const inWindowOrders = orders.filter((order) => withinWindow(order?.createdAt || order?.updatedAt, windowStart, windowEnd))
      const ordersUsingOffers = inWindowOrders.filter((order) => {
        const couponCode = String(order?.pricing?.couponCode || order?.couponCode || "").trim().toUpperCase()
        return couponCode && offerCodeSet.has(couponCode)
      })

      const grossSales = ordersUsingOffers.reduce((sum, order) => sum + getOrderTotalValue(order), 0)
      const discountGiven = ordersUsingOffers.reduce((sum, order) => sum + getOrderDiscountValue(order), 0)
      const offerOrderShare = inWindowOrders.length > 0 ? (ordersUsingOffers.length / inWindowOrders.length) * 100 : 0

      return {
        totalOrders: inWindowOrders.length,
        ordersFromOffers: ordersUsingOffers.length,
        grossSales,
        discountGiven,
        effectiveDiscount: grossSales > 0 ? (discountGiven / grossSales) * 100 : 0,
        offerOrderShare,
      }
    }

    const currentOrders = orders.filter((order) => withinWindow(order?.createdAt || order?.updatedAt, start, end))
    const campaigns = normalizedOffers.map(({ offer, couponCode }) => {
      const relatedOrders = currentOrders.filter((order) => {
        const orderCouponCode = String(order?.pricing?.couponCode || order?.couponCode || "").trim().toUpperCase()
        return couponCode && orderCouponCode === couponCode
      })
      const sales = relatedOrders.reduce((sum, order) => sum + getOrderTotalValue(order), 0)
      const discount = relatedOrders.reduce((sum, order) => sum + getOrderDiscountValue(order), 0)

      return {
        offer,
        couponCode,
        ordersCount: relatedOrders.length,
        sales,
        discount,
        effectiveDiscount: sales > 0 ? (discount / sales) * 100 : 0,
      }
    })

    const current = summarizeWindow(start, end)
    const previous = summarizeWindow(previousStart, previousEnd)

    return {
      current,
      campaigns,
      previous,
      rows: [
        {
          label: "Gross sales from offers",
          value: currency(current.grossSales),
          delta: formatDelta(current.grossSales, previous.grossSales),
        },
        {
          label: "Orders from offers",
          value: current.ordersFromOffers,
          delta: formatDelta(current.ordersFromOffers, previous.ordersFromOffers),
        },
        {
          label: "Discount given",
          value: currency(current.discountGiven),
          delta: formatDelta(current.discountGiven, previous.discountGiven),
        },
        {
          label: "Effective discount",
          value: `${current.effectiveDiscount.toFixed(1)}%`,
          delta: formatDelta(current.effectiveDiscount, previous.effectiveDiscount, true),
        },
        {
          label: "Offer order share",
          value: `${current.offerOrderShare.toFixed(1)}%`,
          delta: formatDelta(current.offerOrderShare, previous.offerOrderShare, true),
        },
      ],
    }
  }, [offers, orders, range])

  const hasAnyCampaignData = metrics.campaigns.some((campaign) => campaign.ordersCount > 0)
  const visibleCampaigns = offerCollections[campaignFilter] || offerCollections.all

  const handleCopyCode = useCallback(async (couponCode) => {
    const normalizedCode = String(couponCode || "").trim()
    if (!normalizedCode || !navigator?.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(normalizedCode)
      setCopiedCode(normalizedCode)
    } catch {
      setCopiedCode("")
    }
  }, [])

  return (
    <RestaurantDesktopShell
      title="Offers"
      subtitle={restaurantName ? `Track offer performance for ${restaurantName}.` : "Track offer performance in a desktop operations layout."}
    >
      <div className="space-y-5">
        <div className="overflow-hidden rounded-[24px] border border-[#e5e8f0] bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="border-b border-[#edf0f5] px-6 py-4">
            <div className="flex items-center gap-8 text-sm font-semibold text-[#6b7386]">
              <button
                type="button"
                onClick={() => setActiveSection("create")}
                className={`pb-2 ${activeSection === "create" ? "border-b-2 border-[#4f78ee] text-[#4f78ee]" : "text-[#6b7386]"}`}
              >
                Create offers
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("track")}
                className={`pb-2 ${activeSection === "track" ? "border-b-2 border-[#4f78ee] text-[#4f78ee]" : "text-[#6b7386]"}`}
              >
                Track offers
              </button>
            </div>
          </div>

          {activeSection === "track" ? (
            <div className="px-6 py-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-[20px] font-bold tracking-[-0.03em] text-[#2a3240]">Overall performance</h2>
                  <p className="mt-1 text-sm text-[#7b8498]">Calculated from recent orders that used your currently active public coupon codes.</p>
                </div>
                <div className="flex rounded-xl bg-[#f4f6fb] p-1">
                  {["weekly", "daily", "monthly"].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setRange(item)}
                      className={`rounded-lg px-4 py-2 text-xs font-semibold capitalize transition ${range === item ? "bg-white text-[#4f78ee] shadow-sm" : "text-[#7b8498]"}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#edf0f5]">
                {offersLoading || ordersLoading ? (
                  <div className="px-5 py-6 text-sm text-[#7b8498]">Loading performance data...</div>
                ) : (
                  metrics.rows.map((row) => (
                    <div key={row.label} className="grid grid-cols-[1.8fr_0.6fr_0.4fr] border-b border-[#edf0f5] px-5 py-4 text-sm last:border-b-0">
                      <span className="text-[#515b6e]">{row.label}</span>
                      <span className="text-right font-semibold text-[#2b3343]">{row.value}</span>
                      <span className={`text-right font-semibold ${String(row.delta).startsWith("-") ? "text-[#e05a67]" : "text-[#2aa865]"}`}>
                        {row.delta}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setCampaignFilter("all")
                  const detailedSection = document.getElementById("desktop-offer-campaigns")
                  detailedSection?.scrollIntoView({ behavior: "smooth", block: "start" })
                }}
                className="mt-4 w-full rounded-2xl bg-[#eef3ff] px-5 py-4 text-center text-sm font-medium text-[#4b67bb]"
              >
                View detailed performance
              </button>

              <div className="mt-4 rounded-2xl border border-[#edf0f5] bg-[#fbfcff] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#2b3343]">Campaign performance</h3>
                    <p className="mt-1 text-sm text-[#7b8498]">
                      Real usage for the selected {range} window, matched by live coupon codes on actual restaurant orders.
                    </p>
                  </div>
                  {!hasAnyCampaignData && !offersLoading && !ordersLoading ? (
                    <span className="rounded-full bg-[#fff6dd] px-3 py-1 text-xs font-semibold text-[#aa7a06]">
                      No redeemed offer orders yet
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 space-y-3">
                  {offersLoading || ordersLoading ? (
                    <div className="text-sm text-[#7b8498]">Loading campaign breakdown...</div>
                  ) : metrics.campaigns.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#d7ddeb] px-5 py-8 text-center text-sm text-[#7b8498]">
                      No live public offers are available for this restaurant right now.
                    </div>
                  ) : (
                    metrics.campaigns.map(({ offer, couponCode, ordersCount, sales, discount, effectiveDiscount }, index) => (
                      <div
                        key={offer.offerId || offer.id || couponCode || index}
                        className="grid grid-cols-[1.6fr_repeat(3,0.7fr)] gap-4 rounded-2xl border border-[#e8ecf5] bg-white px-4 py-4"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[#2b3343]">{offer.title || offer.offerText || `Campaign ${index + 1}`}</p>
                          <p className="mt-1 text-xs text-[#7b8498]">
                            {couponCode ? `Code ${couponCode}` : "Auto-applied public offer"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-[#8891a4]">Orders</p>
                          <p className="mt-1 text-sm font-semibold text-[#2b3343]">{ordersCount}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-[#8891a4]">Sales</p>
                          <p className="mt-1 text-sm font-semibold text-[#2b3343]">{currency(sales)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-[#8891a4]">Discount</p>
                          <p className="mt-1 text-sm font-semibold text-[#2b3343]">
                            {currency(discount)}{" "}
                            <span className="text-xs font-medium text-[#7b8498]">({effectiveDiscount.toFixed(1)}%)</span>
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="px-6 py-6">
              <div className="rounded-2xl border border-[#e7ebf4] bg-[#f8fbff] p-6">
                <h2 className="text-[20px] font-bold tracking-[-0.03em] text-[#2a3240]">Create offers</h2>
                <p className="mt-2 max-w-[720px] text-sm leading-6 text-[#667085]">
                  Offer creation is currently managed through the coupon system configured by admins. This desktop view shows live campaigns and their usage, but it does not have a restaurant-side create endpoint yet.
                </p>
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveSection("track")}
                    className="rounded-xl bg-[#4f78ee] px-4 py-2 text-sm font-semibold text-white"
                  >
                    View live campaigns
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/restaurant/share-feedback")}
                    className="rounded-xl border border-[#dce1eb] bg-white px-4 py-2 text-sm font-semibold text-[#5b6578]"
                  >
                    Request offer access
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div id="desktop-offer-campaigns" className="rounded-[24px] border border-[#e5e8f0] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6d7488]">Offer campaigns</h3>
            <div className="grid grid-cols-4 gap-3">
              {[
                { id: "active", label: `Active (${offerCollections.active.length})` },
                { id: "scheduled", label: `Scheduled (${offerCollections.scheduled.length})` },
                { id: "inactive", label: `Inactive (${offerCollections.inactive.length})` },
                { id: "all", label: `All (${offers.length})` },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCampaignFilter(item.id)}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold ${item.id === campaignFilter ? "border-[#4f78ee] bg-[#4f78ee] text-white" : "border-[#dce1eb] text-[#667085]"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {offersLoading ? (
              <div className="rounded-2xl border border-dashed border-[#d7ddeb] px-5 py-10 text-center text-sm text-[#7b8498]">
                Loading campaigns...
              </div>
            ) : visibleCampaigns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#d7ddeb] px-5 py-10 text-center text-sm text-[#7b8498]">
                {campaignFilter === "scheduled" || campaignFilter === "inactive"
                  ? "This API currently returns only live public offers, so there are no scheduled or inactive campaigns to show here yet."
                  : "No campaigns found for this filter."}
              </div>
            ) : (
              visibleCampaigns.map((offer, index) => (
                <div key={offer.offerId || offer.id || index} className="rounded-2xl border border-[#dbe5ff] bg-[#eef4ff] px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-bold text-[#2b3343]">{offer.title || offer.offerText || `Campaign ${index + 1}`}</p>
                      <p className="mt-1 text-sm text-[#6f7890]">
                        {offer.restaurantScope === "all" ? "All restaurants campaign" : restaurantName || "Selected restaurant campaign"}
                      </p>
                      <p className="mt-1 text-sm text-[#6f7890]">
                        Valid until: {offer.endDate ? formatDateLabel(offer.endDate) : "No expiry"}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-[#556074]">
                        <span className="inline-flex items-center gap-2"><Wallet className="h-4 w-4" />Min order {currency(offer.minOrderValue || 0)}</span>
                        <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" />Code {offer.couponCode || "LIVE"}</span>
                        {offer.maxDiscount ? <span>Max discount {currency(offer.maxDiscount)}</span> : null}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${String(offer.status || "active").toLowerCase() === "active" ? "bg-[#dbf5e8] text-[#209663]" : "bg-[#fff3d6] text-[#b98009]"}`}>
                        {String(offer.status || "active").replace(/^\w/, (char) => char.toUpperCase())}
                      </span>
                      {offer.couponCode ? (
                        <div className="flex flex-col items-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopyCode(offer.couponCode)}
                            className="rounded-lg border border-[#c7d6ff] bg-white px-3 py-1.5 text-xs font-semibold text-[#4771ea]"
                          >
                            Copy code
                          </button>
                          {copiedCode === String(offer.couponCode).trim() ? (
                            <span className="text-[11px] font-medium text-[#23935c]">Copied</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </RestaurantDesktopShell>
  )
}
