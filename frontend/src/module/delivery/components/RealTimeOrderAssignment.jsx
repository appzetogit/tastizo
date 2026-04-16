import { useEffect, useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import {
  Clock,
  MapPin,
  Phone,
  IndianRupee,
  UtensilsCrossed,
  ChevronRight,
  X,
  Timer,
  User,
  Store,
  CheckCircle,
  XCircle
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { deliveryAPI } from "@/lib/api"
import { formatCurrency } from "../../restaurant/utils/currency"

const RealTimeOrderAssignment = ({ 
  order, 
  onAccept, 
  onReject, 
  onExpired,
  isVisible 
}) => {
  const [countdown, setCountdown] = useState(60)
  const [isAccepting, setIsAccepting] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [status, setStatus] = useState('pending') // pending, accepting, rejecting, expired, accepted
  const intervalRef = useRef(null)

  // Countdown timer effect
  useEffect(() => {
    if (isVisible && status === 'pending' && countdown > 0) {
      intervalRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            setStatus('expired')
            onExpired?.(order)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isVisible, status, countdown, order, onExpired])

  // Reset countdown when new order comes in
  useEffect(() => {
    if (order) {
      setCountdown(60)
      setStatus('pending')
      setIsAccepting(false)
      setIsRejecting(false)
    }
  }, [order])

  const handleAccept = useCallback(async () => {
    if (isAccepting || isRejecting) return
    
    setIsAccepting(true)
    setStatus('accepting')
    
    try {
      const response = await deliveryAPI.patch(`/orders/${order.orderMongoId}/accept`, {
        currentLat: 28.2849, // Would get from GPS
        currentLng: 76.1209
      })
      
      if (response.data.success) {
        setStatus('accepted')
        toast.success('Order accepted successfully!')
        onAccept?.(order, response.data)
      } else {
        setStatus('pending')
        toast.error(response.data.message || 'Failed to accept order')
      }
    } catch (error) {
      setStatus('pending')
      toast.error(error.response?.data?.message || 'Failed to accept order')
    } finally {
      setIsAccepting(false)
    }
  }, [order, isAccepting, isRejecting, onAccept])

  const handleReject = useCallback(async () => {
    if (isAccepting || isRejecting) return
    
    setIsRejecting(true)
    setStatus('rejecting')
    
    try {
      const response = await deliveryAPI.patch(`/orders/${order.orderMongoId}/reject`, {
        reason: 'rejected_by_delivery'
      })
      
      if (response.data.success) {
        setStatus('expired')
        toast.success('Order rejected')
        onReject?.(order, response.data)
      } else {
        setStatus('pending')
        toast.error(response.data.message || 'Failed to reject order')
      }
    } catch (error) {
      setStatus('pending')
      toast.error(error.response?.data?.message || 'Failed to reject order')
    } finally {
      setIsRejecting(false)
    }
  }, [order, isAccepting, isRejecting, onReject])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getCountdownColor = () => {
    if (countdown <= 10) return 'text-red-500'
    if (countdown <= 30) return 'text-orange-500'
    return 'text-green-500'
  }

  const getCountdownBgColor = () => {
    if (countdown <= 10) return 'bg-red-500'
    if (countdown <= 30) return 'bg-orange-500'
    return 'bg-green-500'
  }

  if (!order || !isVisible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className="fixed top-0 left-0 right-0 z-50 bg-white shadow-lg"
      >
        {/* Header with countdown */}
        <div className={`${getCountdownBgColor()} text-white p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Timer className="w-5 h-5" />
              <span className="font-semibold">New Order Assignment</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4" />
              <span className={`font-bold text-lg ${getCountdownColor()}`}>
                {formatTime(countdown)}
              </span>
            </div>
          </div>
          {countdown <= 10 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm mt-1"
            >
              Accept now or order will be reassigned!
            </motion.div>
          )}
        </div>

        {/* Order Details */}
        <div className="p-4 space-y-4">
          {/* Restaurant Info */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <Store className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{order.restaurant?.name}</h3>
                  <p className="text-sm text-gray-600 flex items-center mt-1">
                    <MapPin className="w-3 h-3 mr-1" />
                    {order.restaurant?.address || 'Restaurant address'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Distance: {order.distance?.toFixed(1)} km
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer Info */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{order.customer?.name}</h3>
                  <p className="text-sm text-gray-600 flex items-center mt-1">
                    <Phone className="w-3 h-3 mr-1" />
                    {order.customer?.phone}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    <MapPin className="w-3 h-3 mr-1 inline" />
                    {order.deliveryAddress?.formattedAddress || 'Delivery address'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Order Items */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                <UtensilsCrossed className="w-4 h-4 mr-2" />
                Order Items ({order.items?.length || 0})
              </h3>
              <div className="space-y-2">
                {order.items?.slice(0, 3).map((item, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
                {order.items?.length > 3 && (
                  <div className="text-sm text-gray-500">
                    +{order.items.length - 3} more items
                  </div>
                )}
              </div>
              
              <div className="border-t mt-3 pt-3">
                <div className="flex justify-between">
                  <span className="font-semibold">Total Amount</span>
                  <span className="font-bold text-lg">
                    {formatCurrency(order.totalAmount || order.pricing?.total)}
                  </span>
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Payment: {order.paymentMethod === 'cash' ? 'Cash on Delivery' : 'Online Payment'}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <Button
              onClick={handleReject}
              disabled={isAccepting || isRejecting || status !== 'pending'}
              variant="outline"
              className="flex-1"
            >
              {isRejecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </>
              )}
            </Button>
            
            <Button
              onClick={handleAccept}
              disabled={isAccepting || isRejecting || status !== 'pending'}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {isAccepting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Accepting...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Accept Order
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default RealTimeOrderAssignment
