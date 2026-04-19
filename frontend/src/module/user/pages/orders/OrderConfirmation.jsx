import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { CheckCircle2, Check, Loader2 } from "lucide-react"
import { motion } from "framer-motion"
import AnimatedPage from "../../components/AnimatedPage"
import { orderAPI } from "@/lib/api"

const formatPaymentLabel = (paymentMethod = "") => {
  const normalized = String(paymentMethod || "").trim().toLowerCase()

  if (normalized === "wallet") return "Wallet payment"
  if (normalized === "cash" || normalized === "cod") return "Cash on Delivery"
  if (normalized === "razorpay") return "Online payment"
  if (normalized === "upi") return "UPI payment"
  if (normalized === "card") return "Card payment"

  return "payment"
}

export default function OrderConfirmation() {
  const navigate = useNavigate()
  const location = useLocation()
  const { orderId } = useParams()
  const [isLoadingOrder, setIsLoadingOrder] = useState(true)

  const paymentMethod = location.state?.paymentMethod || ""
  const bannerMessage = useMemo(() => {
    const paymentLabel = formatPaymentLabel(paymentMethod)
    return `Order placed with ${paymentLabel}`
  }, [paymentMethod])

  useEffect(() => {
    let isMounted = true
    let redirectTimeoutId = null

    const goToTracking = () => {
      if (!isMounted) return
      navigate(`/user/orders/${orderId}`, { replace: true })
    }

    if (!orderId) {
      navigate("/user/orders", { replace: true })
      return () => {
        isMounted = false
      }
    }

    const loadOrder = async () => {
      try {
        await orderAPI.getOrderDetails(orderId)
      } catch (error) {
        console.warn("Could not preload order details on confirmation screen:", error)
      } finally {
        if (!isMounted) return
        setIsLoadingOrder(false)
        redirectTimeoutId = window.setTimeout(goToTracking, 1400)
      }
    }

    loadOrder()

    return () => {
      isMounted = false
      if (redirectTimeoutId) {
        window.clearTimeout(redirectTimeoutId)
      }
    }
  }, [navigate, orderId])

  return (
    <AnimatedPage className="min-h-screen bg-white px-4 py-4">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-md flex-col">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-green-200 bg-green-50 px-4 py-4 text-green-700 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm font-semibold">{bannerMessage}</p>
          </div>
        </motion.div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mb-8 flex h-20 w-20 items-center justify-center rounded-full border-4 border-green-500"
          >
            <Check className="h-10 w-10 text-green-500" strokeWidth={3} />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-4xl font-extrabold tracking-tight text-slate-950"
          >
            Order Confirmed!
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-3 text-lg text-slate-600"
          >
            Your order has been placed successfully
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="mt-12 flex flex-col items-center"
          >
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-green-500" />
            <p className="text-lg text-slate-600">
              {isLoadingOrder ? "Loading order details..." : "Opening your order..."}
            </p>
          </motion.div>
        </div>
      </div>
    </AnimatedPage>
  )
}
