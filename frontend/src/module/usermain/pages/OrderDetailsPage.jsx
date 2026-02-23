import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  Clock,
  MapPin,
  Phone,
  CheckCircle,
  Package,
  Home,
  Heart,
  ShoppingBag,
  Menu,
  ChefHat,
  Navigation,
  Map,
  MessageCircle,
  Edit2,
  AlertCircle,
  Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import apiClient from "@/lib/api/axios"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export default function OrderDetailsPage() {
  const navigate = useNavigate()
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showMap, setShowMap] = useState(false)

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [formData, setFormData] = useState({
    deliveryAddress: "",
    phoneNumber: "",
    alternatePhone: "",
    deliveryInstructions: ""
  })

  const fetchOrderDetails = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get(`/order/${orderId}`)
      if (response.data.success) {
        const orderData = response.data.data.order
        setOrder(orderData)

        // Initialize form data with current details
        // Prioritize snapshot fields if they exist
        setFormData({
          deliveryAddress: orderData.deliveryAddress || orderData.address?.formattedAddress || "",
          phoneNumber: orderData.phoneNumber || "",
          alternatePhone: orderData.alternatePhone || "",
          deliveryInstructions: orderData.deliveryInstructions || orderData.note || ""
        })
      }
    } catch (error) {
      console.error('Error loading order:', error)
      toast.error(error.response?.data?.message || "Failed to load order details")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrderDetails()
  }, [orderId])

  const handleUpdateDeliveryDetails = async (e) => {
    e.preventDefault()

    if (!formData.deliveryAddress.trim()) {
      toast.error("Delivery address is required")
      return
    }
    if (!formData.phoneNumber.trim()) {
      toast.error("Phone number is required")
      return
    }

    try {
      setIsUpdating(true)
      const response = await apiClient.put(`/order/${orderId}/update-delivery-details`, formData)

      if (response.data.success) {
        toast.success("Delivery details updated successfully")
        setIsEditModalOpen(false)
        fetchOrderDetails() // Refresh data
      }
    } catch (error) {
      console.error('Error updating delivery details:', error)
      toast.error(error.response?.data?.message || "Failed to update delivery details")
    } finally {
      setIsUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6e9dc] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#ff8100] animate-spin" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#f6e9dc] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Order not found</p>
          <Button
            onClick={() => navigate('/usermain/orders')}
            className="mt-4 bg-[#ff8100] hover:bg-[#e67300] text-white"
          >
            Back to Orders
          </Button>
        </div>
      </div>
    )
  }

  const items = order.items || []
  const canEdit = ["pending", "confirmed"].includes(order.status)

  return (
    <div className="min-h-screen bg-[#f6e9dc] pb-20 md:pb-24">
      {/* Header */}
      <div className="bg-white sticky top-0 z-50 rounded-b-3xl shadow-sm">
        <div className="px-4 py-2.5 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 md:p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 text-gray-800" />
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-900">Order Details</h1>
          </div>
          {canEdit && (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="p-2 bg-[#ff8100]/10 text-[#ff8100] rounded-full hover:bg-[#ff8100]/20 transition-colors"
              title="Edit Delivery Details"
            >
              <Edit2 className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Order Status Card */}
      <div className="px-4 py-3 md:py-4">
        <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-orange-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm md:text-base font-bold text-gray-900 mb-1">Order #{order.orderId}</h3>
              <p className="text-xs md:text-sm text-gray-600 font-medium">{order.restaurantName}</p>
            </div>
            <div className={`px-3 py-1 md:py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${order.status === "delivered"
                ? "bg-green-100 text-green-700"
                : order.status === "cancelled"
                  ? "bg-red-100 text-red-700"
                  : "bg-orange-100 text-orange-700"
              }`}>
              {order.status}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
            <Clock className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#ff8100]" />
            <span>
              {new Date(order.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })} at {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {/* Track Order: Map toggle + Chat */}
      {["confirmed", "preparing", "ready", "out_for_delivery"].includes(order.status) && (
        <div className="px-4 mb-3 md:mb-4">
          <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Map className="w-4 h-4 md:w-5 md:h-5 text-[#ff8100]" />
                <span className="text-sm md:text-base font-semibold text-gray-900">Track Order</span>
              </div>
              <button
                onClick={() => setShowMap(!showMap)}
                className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-[#ff8100] hover:bg-[#e67300] text-white rounded-lg text-xs md:text-sm font-semibold transition-colors shadow-md"
              >
                <Navigation className="w-3.5 h-3.5 md:w-4 md:h-4" />
                {showMap ? "Hide Map" : "Show Map"}
              </button>
            </div>
            <button
              onClick={() => navigate(`/usermain/orders/${orderId}/chat`)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-[#ff8100] text-[#ff8100] hover:bg-[#ff8100] hover:text-white transition-all text-sm font-bold active:scale-[0.98]"
            >
              <MessageCircle className="w-4 h-4 md:w-5 md:h-5" />
              Chat with delivery partner
            </button>
          </div>
        </div>
      )}

      {/* Map View */}
      {showMap && (
        <div className="px-4 mb-3 md:mb-4">
          <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-orange-100">
            <div className="relative w-full h-64 md:h-80 bg-gray-200">
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-100 to-blue-200">
                <div className="text-center">
                  <MapPin className="w-12 h-12 md:w-16 md:h-16 text-[#ff8100] mx-auto mb-2 animate-bounce" />
                  <p className="text-sm md:text-base font-bold text-gray-700">Live Tracking</p>
                  <p className="text-xs md:text-sm text-gray-600 mt-1 uppercase tracking-widest">{order.status.replace(/_/g, ' ')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Items */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm">
          <h3 className="text-sm md:text-base font-bold text-gray-900 mb-3 border-b border-gray-100 pb-2">Order Items</h3>
          <div className="space-y-3">
            {items.length > 0 ? (
              items.map((item, index) => (
                <div key={index} className="flex items-center justify-between pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                  <div className="flex-1">
                    <p className="text-xs md:text-sm font-bold text-gray-900">{item.name}</p>
                    <p className="text-[10px] md:text-xs text-gray-500 font-medium">Quantity: {item.quantity} × ₹{item.price}</p>
                  </div>
                  <p className="text-xs md:text-sm font-bold text-[#ff8100]">
                    ₹{(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs md:text-sm text-gray-600">No items found</p>
            )}
          </div>
        </div>
      </div>

      {/* Order Summary */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm">
          <h3 className="text-sm md:text-base font-bold text-gray-900 mb-3 border-b border-gray-100 pb-2">Order Summary</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs md:text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900 font-bold">₹{(order.pricing?.subtotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs md:text-sm">
              <span className="text-gray-600">Delivery Fee</span>
              <span className="text-gray-900 font-bold">₹{(order.pricing?.deliveryFee || 0).toFixed(2)}</span>
            </div>
            {order.pricing?.discount > 0 && (
              <div className="flex items-center justify-between text-xs md:text-sm">
                <span className="text-gray-600">Discount</span>
                <span className="text-[#ff8100] font-bold">-₹{order.pricing.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-dashed border-gray-200 pt-3 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm md:text-base font-black text-gray-900">Total</span>
                <span className="text-lg md:text-xl font-black text-[#ff8100]">₹{(order.pricing?.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Information */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
            <h3 className="text-sm md:text-base font-bold text-gray-900">Delivery Information</h3>
            {canEdit && (
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="text-[#ff8100] text-xs font-bold flex items-center gap-1 hover:underline"
              >
                <Edit2 className="w-3 h-3" />
                Change
              </button>
            )}
          </div>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="bg-orange-100 rounded-xl p-2.5 flex-shrink-0">
                <MapPin className="w-5 h-5 text-[#ff8100]" />
              </div>
              <div className="flex-1">
                <p className="text-xs md:text-sm font-bold text-gray-900 mb-1">Delivery Address</p>
                <p className="text-[11px] md:text-xs text-gray-600 leading-relaxed">
                  {order.deliveryAddress || order.address?.formattedAddress || "Address not available"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-orange-100 rounded-xl p-2.5 flex-shrink-0">
                <Phone className="w-5 h-5 text-[#ff8100]" />
              </div>
              <div className="flex-1">
                <p className="text-xs md:text-sm font-bold text-gray-900 mb-1">Contact Details</p>
                <p className="text-[11px] md:text-xs text-gray-600">
                  Phone: {order.phoneNumber || order.userId?.phone || "Not provided"}
                </p>
                {order.alternatePhone && (
                  <p className="text-[11px] md:text-xs text-gray-600 mt-0.5">
                    Alt: {order.alternatePhone}
                  </p>
                )}
              </div>
            </div>

            {(order.deliveryInstructions || order.note) && (
              <div className="flex items-start gap-4">
                <div className="bg-orange-100 rounded-xl p-2.5 flex-shrink-0">
                  <MessageCircle className="w-5 h-5 text-[#ff8100]" />
                </div>
                <div className="flex-1">
                  <p className="text-xs md:text-sm font-bold text-gray-900 mb-1">Instructions</p>
                  <p className="text-[11px] md:text-xs text-gray-600 italic">
                    "{order.deliveryInstructions || order.note}"
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-4">
              <div className="bg-orange-100 rounded-xl p-2.5 flex-shrink-0">
                <Package className="w-5 h-5 text-[#ff8100]" />
              </div>
              <div className="flex-1">
                <p className="text-xs md:text-sm font-bold text-gray-900 mb-1">Payment Method</p>
                <p className="text-[11px] md:text-xs text-gray-600 font-bold uppercase tracking-wider">
                  {order.payment?.method === "cash" ? "Cash on Delivery" : order.payment?.method || "Online Payment"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Delivery Details Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-[#ff8100]" />
              Edit Delivery Details
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateDeliveryDetails} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="deliveryAddress" className="text-sm font-bold text-gray-700">Delivery Address *</Label>
              <Textarea
                id="deliveryAddress"
                placeholder="Enter full address..."
                className="min-h-[80px] rounded-xl focus:ring-[#ff8100]"
                value={formData.deliveryAddress}
                onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phoneNumber" className="text-sm font-bold text-gray-700">Phone Number *</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="10 digit number"
                  className="rounded-xl focus:ring-[#ff8100]"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="alternatePhone" className="text-sm font-bold text-gray-700">Alt. Phone</Label>
                <Input
                  id="alternatePhone"
                  type="tel"
                  placeholder="Optional"
                  className="rounded-xl focus:ring-[#ff8100]"
                  value={formData.alternatePhone}
                  onChange={(e) => setFormData({ ...formData, alternatePhone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructions" className="text-sm font-bold text-gray-700">Delivery Instructions</Label>
              <Textarea
                id="instructions"
                placeholder="e.g. Leave at the gate, Ring the bell..."
                className="min-h-[60px] rounded-xl focus:ring-[#ff8100]"
                value={formData.deliveryInstructions}
                onChange={(e) => setFormData({ ...formData, deliveryInstructions: e.target.value })}
              />
            </div>

            <div className="bg-orange-50 p-3 rounded-xl flex gap-3 items-start border border-orange-100 mt-2">
              <AlertCircle className="w-4 h-4 text-[#ff8100] mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-[#8b4513] font-medium leading-relaxed">
                Updates here only apply to this specific order. Your global profile address remains unchanged.
              </p>
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditModalOpen(false)}
                className="rounded-xl font-bold border-gray-200 text-gray-600 hover:bg-gray-50 flex-1"
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#ff8100] hover:bg-[#e67300] text-white rounded-xl font-bold flex-1 shadow-md shadow-orange-200"
                disabled={isUpdating}
              >
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Updates
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Contact Support */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm border border-gray-50">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff8100] rounded-xl p-2.5 shadow-sm">
              <Phone className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-xs md:text-sm font-bold text-gray-900">Need Help?</p>
              <p className="text-[10px] md:text-xs text-gray-500 font-medium">Contact our support team</p>
            </div>
            <Button
              className="bg-white hover:bg-gray-50 text-[#ff8100] border-2 border-[#ff8100] text-xs md:text-sm font-bold px-4 py-2 rounded-xl"
              onClick={() => {
                window.location.href = "tel:+911234567890" // Standard Indian support format
              }}
            >
              Call
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar - Mobile Only */}
      <div className="md:hidden fixed bottom-6 left-4 right-4 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl shadow-orange-900/10 border border-white/20 z-50">
        <div className="flex items-center justify-around py-3 px-2">
          <button
            onClick={() => navigate('/usermain')}
            className="flex flex-col items-center gap-1 text-gray-400 hover:text-[#ff8100] transition-colors"
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] uppercase tracking-tighter font-bold">Home</span>
          </button>
          <button
            onClick={() => navigate('/usermain/wishlist')}
            className="flex flex-col items-center gap-1 text-gray-400 hover:text-[#ff8100] transition-colors"
          >
            <Heart className="w-5 h-5" />
            <span className="text-[10px] uppercase tracking-tighter font-bold">Wishlist</span>
          </button>
          <button className="flex flex-col items-center gap-1 -mt-10">
            <div className="bg-[#ff8100] rounded-full p-4 shadow-lg shadow-orange-500/40 border-4 border-[#f6e9dc]">
              <ChefHat className="w-6 h-6 text-white" />
            </div>
          </button>
          <button
            onClick={() => navigate('/usermain/orders')}
            className="flex flex-col items-center gap-1 text-[#ff8100]"
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[10px] uppercase tracking-tighter font-bold">Orders</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-gray-400">
            <Menu className="w-5 h-5" />
            <span className="text-[10px] uppercase tracking-tighter font-bold">Menu</span>
          </button>
        </div>
      </div>
    </div>
  )
}
