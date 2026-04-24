import { useParams, Link, useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  ArrowLeft,
  Share2,
  RefreshCw,
  Phone,
  ChevronRight,
  MapPin,
  Home as HomeIcon,
  MessageSquare,
  MessageCircle,
  X,
  Check,
  Shield,
  Receipt,
  CircleSlash,
  Loader2,
  Star
} from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useOrders } from "../../context/OrdersContext"
import { useProfile } from "../../context/ProfileContext"
import { useLocation as useUserLocation } from "../../hooks/useLocation"
import DeliveryTrackingMap from "../../components/DeliveryTrackingMap"
import { orderAPI, restaurantAPI } from "@/lib/api"
import { shareWithFallback } from "@/lib/utils/shareBridge"
import circleIcon from "@/assets/circleicon.png"
import {
  RESTAURANT_CONTACT_UNAVAILABLE_MESSAGE,
  normalizeTelPhone,
  resolveRestaurantPhone,
} from "./restaurantContact"

const hasAssignedDeliveryPartner = (order) => {
  return !!(
    order?.deliveryPartnerId ||
    order?.deliveryPartner?._id ||
    order?.assignmentInfo?.deliveryPartnerId
  );
};

const getOrderTrackingStatus = (order) => {
  const status = order?.status;
  const phase = order?.deliveryState?.currentPhase;

  if (status === "cancelled") return "cancelled";
  if (status === "delivered") return "delivered";
  if (status === "out_for_delivery" || phase === "en_route_to_delivery" || phase === "at_delivery") {
    return "pickup";
  }
  if (status === "ready") return "prepared";
  if (status === "preparing") return "preparing";

  return "placed";
};

const isTerminalOrderStatus = (status) => status === "delivered" || status === "cancelled";

const isOrderPickedUp = (order) => {
  return Boolean(
    order?.tracking?.outForDelivery?.status === true ||
    order?.tracking?.out_for_delivery?.status === true ||
    order?.status === "out_for_delivery" ||
    order?.deliveryState?.currentPhase === "en_route_to_delivery" ||
    order?.deliveryState?.currentPhase === "at_delivery" ||
    order?.deliveryState?.status === "order_confirmed"
  );
};

const toTitleCase = (value) =>
  String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getDeliveryPartnerSnapshot = (deliveryPartner) => {
  if (!deliveryPartner || typeof deliveryPartner !== "object") return null;

  const profilePhoto =
    deliveryPartner.profileImage?.url ||
    deliveryPartner.profileImage ||
    deliveryPartner.avatar ||
    null;

  return {
    _id: deliveryPartner._id || null,
    name: deliveryPartner.name || "Delivery Partner",
    phone: deliveryPartner.phone || "",
    email: deliveryPartner.email || "",
    avatar: profilePhoto,
    profilePhoto,
    vehicleType: deliveryPartner.vehicle?.type || "",
    vehicleNumber: deliveryPartner.vehicle?.number || "",
    vehicleModel: deliveryPartner.vehicle?.model || "",
  };
};

const mapApiOrderToTrackingOrder = (apiOrder, restaurantCoords, previousOrder = null) => ({
  id: apiOrder.orderId || apiOrder._id,
  mongoId: apiOrder._id,
  restaurant: apiOrder.restaurantName || "Restaurant",
  restaurantId: apiOrder.restaurantId || null,
  restaurantImage:
    apiOrder.restaurantId?.profileImage?.url ||
    apiOrder.restaurantId?.profileImage ||
    previousOrder?.restaurantImage ||
    null,
  restaurantPhone: resolveRestaurantPhone(apiOrder),
  userId: apiOrder.userId || null,
  userName: apiOrder.userName || apiOrder.userId?.name || apiOrder.userId?.fullName || "",
  userPhone: apiOrder.userPhone || apiOrder.userId?.phone || "",
  address: {
    street: apiOrder.address?.street || "",
    city: apiOrder.address?.city || "",
    state: apiOrder.address?.state || "",
    zipCode: apiOrder.address?.zipCode || "",
    additionalDetails: apiOrder.address?.additionalDetails || "",
    formattedAddress:
      apiOrder.address?.formattedAddress ||
      (apiOrder.address?.street && apiOrder.address?.city
        ? `${apiOrder.address.street}${apiOrder.address.additionalDetails ? `, ${apiOrder.address.additionalDetails}` : ""}, ${apiOrder.address.city}${apiOrder.address.state ? `, ${apiOrder.address.state}` : ""}${apiOrder.address.zipCode ? ` ${apiOrder.address.zipCode}` : ""}`
        : apiOrder.address?.city || ""),
    coordinates: apiOrder.address?.location?.coordinates || null
  },
  restaurantLocation: restaurantCoords
    ? { coordinates: restaurantCoords }
    : previousOrder?.restaurantLocation || { coordinates: null },
  items: apiOrder.items?.map(item => ({
    name: item.name,
    quantity: item.quantity,
    price: item.price
  })) || [],
  total: apiOrder.pricing?.total || 0,
  paymentMethod: apiOrder.payment?.method || apiOrder.paymentMethod || "",
  status: apiOrder.status || "pending",
  deliveryPartner: getDeliveryPartnerSnapshot(apiOrder.deliveryPartnerId),
  deliveryPartnerId: apiOrder.deliveryPartnerId?._id || apiOrder.deliveryPartnerId || apiOrder.assignmentInfo?.deliveryPartnerId || null,
  assignmentInfo: apiOrder.assignmentInfo || null,
  tracking: apiOrder.tracking || {},
  deliveryState: apiOrder.deliveryState || null,
  deliveryInstructions: apiOrder.deliveryInstructions || "",
  deliveryAddress: apiOrder.deliveryAddress || undefined,
  phoneNumber: apiOrder.phoneNumber || undefined,
  deliveryVerification: apiOrder.deliveryVerification || null,
  review: apiOrder.review || null,
  rating: apiOrder.rating || apiOrder.review?.rating || null,
  hasReview: Boolean(apiOrder.hasReview || apiOrder.review?.rating || apiOrder.rating)
});

// Real Delivery Map Component with User Live Location
const DeliveryMap = ({ orderId, order, isVisible }) => {
  const { location: userLocation } = useUserLocation() // Get user's live location

  // Get coordinates from order or use defaults (Indore)
  const getRestaurantCoords = () => {
    console.log('🔍 Getting restaurant coordinates from order:', {
      hasOrder: !!order,
      restaurantLocation: order?.restaurantLocation,
      coordinates: order?.restaurantLocation?.coordinates,
      restaurantId: order?.restaurantId,
      restaurantIdLocation: order?.restaurantId?.location,
      restaurantIdCoordinates: order?.restaurantId?.location?.coordinates
    });

    // Try multiple sources for restaurant coordinates
    let coords = null;

    // Priority 1: restaurantLocation.coordinates (already extracted in transformed order)
    if (order?.restaurantLocation?.coordinates &&
      Array.isArray(order.restaurantLocation.coordinates) &&
      order.restaurantLocation.coordinates.length >= 2) {
      coords = order.restaurantLocation.coordinates;
      console.log('✅ Using restaurantLocation.coordinates:', coords);
    }
    // Priority 2: restaurantId.location.coordinates (if restaurantId is populated)
    else if (order?.restaurantId?.location?.coordinates &&
      Array.isArray(order.restaurantId.location.coordinates) &&
      order.restaurantId.location.coordinates.length >= 2) {
      coords = order.restaurantId.location.coordinates;
      console.log('✅ Using restaurantId.location.coordinates:', coords);
    }
    // Priority 3: restaurantId.location with latitude/longitude
    else if (order?.restaurantId?.location?.latitude && order?.restaurantId?.location?.longitude) {
      coords = [order.restaurantId.location.longitude, order.restaurantId.location.latitude];
      console.log('✅ Using restaurantId.location (lat/lng):', coords);
    }

    if (coords && coords.length >= 2) {
      // GeoJSON format is [longitude, latitude]
      const result = {
        lat: coords[1], // Latitude is second element
        lng: coords[0]  // Longitude is first element
      };
      console.log('✅ Final restaurant coordinates (lat, lng):', result, 'from GeoJSON:', coords);
      return result;
    }

    console.warn('⚠️ Restaurant coordinates not found, using default Indore coordinates');
    // Default Indore coordinates
    return { lat: 22.7196, lng: 75.8577 };
  };

  const getCustomerCoords = () => {
    if (order?.address?.location?.coordinates) {
      return {
        lat: order.address.location.coordinates[1],
        lng: order.address.location.coordinates[0]
      };
    }
    if (order?.address?.coordinates) {
      return {
        lat: order.address.coordinates[1],
        lng: order.address.coordinates[0]
      };
    }
    // Default Indore coordinates
    return { lat: 22.7196, lng: 75.8577 };
  };

  // Get user's live location coordinates
  const getUserLiveCoords = () => {
    if (userLocation?.latitude && userLocation?.longitude) {
      return {
        lat: userLocation.latitude,
        lng: userLocation.longitude
      };
    }
    return null;
  };

  const restaurantCoords = getRestaurantCoords();
  const customerCoords = getCustomerCoords();
  const userLiveCoords = getUserLiveCoords();

  // Delivery boy data
  const deliveryBoyData = order?.deliveryPartner ? {
    name: order.deliveryPartner.name || 'Delivery Partner',
    avatar: order.deliveryPartner.avatar || null
  } : null;

  if (!isVisible || !orderId || !order) {
    return (
      <motion.div
        className="relative h-64 bg-gradient-to-b from-gray-100 to-gray-200"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      />
    );
  }

  return (
    <motion.div
      className="relative h-64 w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <DeliveryTrackingMap
        orderId={orderId}
        restaurantCoords={restaurantCoords}
        customerCoords={customerCoords}
        userLiveCoords={userLiveCoords}
        userLocationAccuracy={userLocation?.accuracy}
        deliveryBoyData={deliveryBoyData}
        order={order}
      />
    </motion.div>
  );
}

// Section item component
const SectionItem = ({ icon: Icon, title, subtitle, onClick, showArrow = true, rightContent }) => (
  <motion.button
    onClick={onClick}
    className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left border-b border-dashed border-gray-200 last:border-0"
    whileTap={{ scale: 0.99 }}
  >
    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
      <Icon className="w-5 h-5 text-gray-600" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-medium text-gray-900 truncate">{title}</p>
      {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
    </div>
    {rightContent || (showArrow && <ChevronRight className="w-5 h-5 text-gray-400" />)}
  </motion.button>
)

export default function OrderTracking() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { getOrderById } = useOrders()
  const { profile, getDefaultAddress } = useProfile()

  // State for order data
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [orderStatus, setOrderStatus] = useState('placed')
  const [estimatedTime, setEstimatedTime] = useState(29)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancellationReason, setCancellationReason] = useState("")
  const [isCancelling, setIsCancelling] = useState(false)
  const [showDeliveryInstructionsDialog, setShowDeliveryInstructionsDialog] = useState(false)
  const [deliveryInstructionsText, setDeliveryInstructionsText] = useState("")
  const [isSavingInstructions, setIsSavingInstructions] = useState(false)

  // Review states
  const [rating, setRating] = useState(0)
  const [reviewComment, setReviewComment] = useState("")
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)
  const [reviewSubmitted, setReviewSubmitted] = useState(false)

  const defaultAddress = getDefaultAddress()

  // Poll for order updates (especially when delivery partner accepts)
  // Only poll if delivery partner is not yet assigned to avoid unnecessary updates
  useEffect(() => {
    if (!orderId || !order) return;
    if (isTerminalOrderStatus(getOrderTrackingStatus(order))) return;

    // Skip polling if delivery partner is already assigned and accepted
    const currentDeliveryStatus = order?.deliveryState?.status;
    const currentPhase = order?.deliveryState?.currentPhase;
    const hasDeliveryPartner = currentDeliveryStatus === 'accepted' ||
      currentPhase === 'en_route_to_pickup' ||
      currentPhase === 'at_pickup' ||
      currentPhase === 'en_route_to_delivery';

    // If delivery partner is assigned, reduce polling frequency to 30 seconds
    // If not assigned, poll every 5 seconds to detect assignment
    const pollInterval = hasDeliveryPartner ? 30000 : 5000;

    const interval = setInterval(async () => {
      try {
        const response = await orderAPI.getOrderDetails(orderId);
        if (response.data?.success && response.data.data?.order) {
          const apiOrder = response.data.data.order;

          // Check if delivery state changed (e.g., status became 'accepted')
          const newDeliveryStatus = apiOrder.deliveryState?.status;
          const newPhase = apiOrder.deliveryState?.currentPhase;
          const newOrderStatus = apiOrder.status;
          const currentOrderStatus = order?.status;

          // Only update if status actually changed
          if (newDeliveryStatus === 'accepted' ||
            (newDeliveryStatus !== currentDeliveryStatus) ||
            (newPhase !== currentPhase) ||
            (newOrderStatus !== currentOrderStatus)) {
            console.log('🔄 Order status updated:', {
              oldStatus: currentDeliveryStatus,
              newStatus: newDeliveryStatus,
              oldPhase: currentPhase,
              newPhase: newPhase
            });

            // Re-fetch and update order (same logic as initial fetch)
            let restaurantCoords = null;
            if (apiOrder.restaurantId?.location?.coordinates &&
              Array.isArray(apiOrder.restaurantId.location.coordinates) &&
              apiOrder.restaurantId.location.coordinates.length >= 2) {
              restaurantCoords = apiOrder.restaurantId.location.coordinates;
            } else if (typeof apiOrder.restaurantId === 'string') {
              try {
                const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);
                if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
                  const restaurant = restaurantResponse.data.data.restaurant;
                  if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {
                    restaurantCoords = restaurant.location.coordinates;
                  }
                }
              } catch (err) {
                console.error('❌ Error fetching restaurant details:', err);
              }
            }

            const transformedOrder = {
              ...apiOrder,
              deliveryPartner: getDeliveryPartnerSnapshot(apiOrder.deliveryPartnerId),
              restaurantLocation: restaurantCoords ? {
                coordinates: restaurantCoords
              } : order.restaurantLocation,
              deliveryPartnerId: apiOrder.deliveryPartnerId?._id || apiOrder.deliveryPartnerId || apiOrder.assignmentInfo?.deliveryPartnerId || null,
              assignmentInfo: apiOrder.assignmentInfo || null,
              deliveryState: apiOrder.deliveryState || null
            };

            setOrder(transformedOrder);
            setOrderStatus(getOrderTrackingStatus(transformedOrder));
          }
        }
      } catch (err) {
        console.error('Error polling order updates:', err);
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [orderId, order?.status, order?.deliveryState?.status, order?.deliveryState?.currentPhase]);

  // Fetch order from API if not found in context
  useEffect(() => {
    const fetchOrder = async () => {
      // First try to get from context (localStorage)
      const contextOrder = getOrderById(orderId)
      if (contextOrder) {
        // Ensure restaurant location is available in context order
        if (!contextOrder.restaurantLocation?.coordinates && contextOrder.restaurantId?.location?.coordinates) {
          contextOrder.restaurantLocation = {
            coordinates: contextOrder.restaurantId.location.coordinates
          };
        }
        // Also ensure restaurantId is present
        if (!contextOrder.restaurantId && contextOrder.restaurant) {
          // Try to preserve restaurantId if it exists
          console.log('⚠️ Context order missing restaurantId, will fetch from API');
        }
        setOrder(contextOrder)
        setOrderStatus(getOrderTrackingStatus(contextOrder))
        setLoading(false)
      }

      // Always hydrate from API so the restaurant phone belongs to the current order.
      try {
        if (!contextOrder) {
          setLoading(true)
        }
        setError(null)

        const response = await orderAPI.getOrderDetails(orderId)

        if (response.data?.success && response.data.data?.order) {
          const apiOrder = response.data.data.order

          // Log full API response structure for debugging
          console.log('🔍 Full API Order Response:', {
            orderId: apiOrder.orderId || apiOrder._id,
            hasRestaurantId: !!apiOrder.restaurantId,
            restaurantIdType: typeof apiOrder.restaurantId,
            restaurantIdKeys: apiOrder.restaurantId ? Object.keys(apiOrder.restaurantId) : [],
            restaurantIdLocation: apiOrder.restaurantId?.location,
            restaurantIdLocationKeys: apiOrder.restaurantId?.location ? Object.keys(apiOrder.restaurantId.location) : [],
            restaurantIdCoordinates: apiOrder.restaurantId?.location?.coordinates,
            fullRestaurantId: apiOrder.restaurantId
          });

          // Extract restaurant location coordinates with multiple fallbacks
          let restaurantCoords = null;

          // Priority 1: restaurantId.location.coordinates (GeoJSON format: [lng, lat])
          if (apiOrder.restaurantId?.location?.coordinates &&
            Array.isArray(apiOrder.restaurantId.location.coordinates) &&
            apiOrder.restaurantId.location.coordinates.length >= 2) {
            restaurantCoords = apiOrder.restaurantId.location.coordinates;
            console.log('✅ Found coordinates in restaurantId.location.coordinates:', restaurantCoords);
          }
          // Priority 2: restaurantId.location with latitude/longitude properties
          else if (apiOrder.restaurantId?.location?.latitude && apiOrder.restaurantId?.location?.longitude) {
            restaurantCoords = [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude];
            console.log('✅ Found coordinates in restaurantId.location (lat/lng):', restaurantCoords);
          }
          // Priority 3: Check if restaurantId is a string ID and fetch restaurant details
          else if (typeof apiOrder.restaurantId === 'string') {
            console.log('⚠️ restaurantId is a string ID, fetching restaurant details...', apiOrder.restaurantId);
            try {
              const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);
              if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
                const restaurant = restaurantResponse.data.data.restaurant;
                if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {
                  restaurantCoords = restaurant.location.coordinates;
                  console.log('✅ Fetched restaurant coordinates from API:', restaurantCoords);
                }
              }
            } catch (err) {
              console.error('❌ Error fetching restaurant details:', err);
            }
          }
          // Priority 4: Check nested restaurant data
          else if (apiOrder.restaurant?.location?.coordinates) {
            restaurantCoords = apiOrder.restaurant.location.coordinates;
            console.log('✅ Found coordinates in restaurant.location.coordinates:', restaurantCoords);
          }

          console.log('📍 Final restaurant coordinates:', restaurantCoords);
          console.log('📍 Customer coordinates:', apiOrder.address?.location?.coordinates);

          // Transform API order to match component structure
          const transformedOrder = mapApiOrderToTrackingOrder(apiOrder, restaurantCoords)

          setOrder(transformedOrder)
          setOrderStatus(getOrderTrackingStatus(apiOrder))
        } else {
          throw new Error('Order not found')
        }
      } catch (err) {
        console.error('Error fetching order:', err)
        if (!contextOrder) {
          setError(err.response?.data?.message || err.message || 'Failed to fetch order')
        }
      } finally {
        setLoading(false)
      }
    }

    if (orderId) {
      fetchOrder()
    }
  }, [orderId, getOrderById])

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setEstimatedTime((prev) => Math.max(0, prev - 1))
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  // Listen for order status updates from socket (e.g., "Delivery partner on the way")
  useEffect(() => {
    const handleOrderStatusNotification = (event) => {
      const { message, title, status, estimatedDeliveryTime } = event.detail;

      console.log('📢 Order status notification received:', { message, status });

      // Update order status in UI
      if (status === 'out_for_delivery') {
        setOrderStatus('pickup');
      }

      // Show notification toast
      if (message) {
        toast.success(message, {
          duration: 5000,
          icon: '🏍️',
          position: 'top-center',
          description: estimatedDeliveryTime
            ? `Estimated delivery in ${Math.round(estimatedDeliveryTime / 60)} minutes`
            : undefined
        });

        // Optional: Vibrate device if supported
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      }
    };

    // Listen for custom event from DeliveryTrackingMap
    window.addEventListener('orderStatusNotification', handleOrderStatusNotification);

    return () => {
      window.removeEventListener('orderStatusNotification', handleOrderStatusNotification);
    };
  }, [])

  const handleCancelOrder = () => {
    // Check if order can be cancelled (only Razorpay orders that aren't delivered/cancelled)
    if (!order) return;

    if (order.status === 'cancelled') {
      toast.error('Order is already cancelled');
      return;
    }

    if (order.status === 'delivered') {
      toast.error('Cannot cancel a delivered order');
      return;
    }

    // Allow cancellation for all payment methods (Razorpay, COD, Wallet)
    // Only restrict if order is already cancelled or delivered (checked above)

    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancellationReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }

    setIsCancelling(true);
    try {
      const response = await orderAPI.cancelOrder(orderId, cancellationReason.trim());
      if (response.data?.success) {
        const paymentMethod = order?.payment?.method || order?.paymentMethod;
        const successMessage = response.data?.message ||
          (paymentMethod === 'cash' || paymentMethod === 'cod'
            ? 'Order cancelled successfully. No refund required as payment was not made.'
            : 'Order cancelled successfully. Refund will be processed after admin approval.');
        toast.success(successMessage);
        setShowCancelDialog(false);
        setCancellationReason("");
        // Refresh order data
        const orderResponse = await orderAPI.getOrderDetails(orderId);
        if (orderResponse.data?.success && orderResponse.data.data?.order) {
          const apiOrder = orderResponse.data.data.order;
          setOrder(apiOrder);
          // Update orderStatus to cancelled
          if (apiOrder.status === 'cancelled') {
            setOrderStatus('cancelled');
          }
        }
      } else {
        toast.error(response.data?.message || 'Failed to cancel order');
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel order');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSubmitReview = async () => {
    if (rating === 0) {
      toast.error("Please select a rating")
      return
    }

    try {
      setIsSubmittingReview(true)

      // Prefer MongoDB _id for the review API; fall back to route orderId if needed
      const orderMongoId = order?.mongoId || order?._id || orderId

      const response = await orderAPI.submitOrderReview(String(orderMongoId), {
        rating,
        comment: reviewComment
      })

      if (response.data?.success) {
        toast.success("Review submitted! Thank you for your feedback.")
        setReviewSubmitted(true)
        setOrder((prev) =>
          prev
            ? {
              ...prev,
              review: { rating, comment: reviewComment?.trim() || "" },
              rating,
              hasReview: true,
            }
            : prev,
        )
      } else {
        toast.error(response.data?.message || "Failed to submit review")
      }
    } catch (error) {
      console.error("Error submitting review:", error)
      const message = error?.response?.data?.message || "Failed to submit review. Please try again."
      if ([400, 409].includes(error?.response?.status) && message.toLowerCase().includes("already")) {
        setReviewSubmitted(true)
        toast.info("You have already rated this order.")
        return
      }
      toast.error(message)
    } finally {
      setIsSubmittingReview(false)
    }
  }

  const handleShare = async () => {
    const shareData = {
      title: `Track my order from ${order?.restaurant || 'Tastizo'}`,
      text: `Hey, I'm tracking my order from ${order?.restaurant || 'the restaurant'} on Tastizo!`,
      url: window.location.href,
    };

    await shareWithFallback(shareData)
  };

  const handleCallRestaurant = async () => {
    if (!order) return;
    let restaurantPhone = resolveRestaurantPhone(order);
    const restaurantId =
      typeof order.restaurantId === "string"
        ? order.restaurantId
        : order.restaurantId?._id || order.restaurantId?.id;

    if (!restaurantPhone && restaurantId) {
      try {
        const res = await restaurantAPI.getRestaurantById(restaurantId);
        const r = res?.data?.data?.restaurant;
        restaurantPhone = resolveRestaurantPhone(order, r);
      } catch (e) {
        console.error("Error fetching restaurant for phone:", e);
      }
    }
    const telPhone = normalizeTelPhone(restaurantPhone);
    if (!telPhone) {
      console.warn("Restaurant contact number unavailable for order", {
        orderId: order.id || order.orderId || order.mongoId || orderId,
        restaurantId,
        hasRestaurantPhone: Boolean(restaurantPhone),
      });
      toast.error(RESTAURANT_CONTACT_UNAVAILABLE_MESSAGE);
      return;
    }
    window.location.href = `tel:${telPhone}`;
  };

  const handleCallDeliveryPartner = () => {
    const telPhone = normalizeTelPhone(order?.deliveryPartner?.phone);
    if (!telPhone) {
      toast.error("Delivery partner contact number not available");
      return;
    }
    window.location.href = `tel:${telPhone}`;
  };

  const handleOpenDeliveryInstructions = () => {
    setDeliveryInstructionsText(order?.deliveryInstructions ?? "");
    setShowDeliveryInstructionsDialog(true);
  };

  const handleSaveDeliveryInstructions = async () => {
    if (!orderId || !order) return;
    // Prefer snapshot stored at order creation (API returns deliveryAddress, phoneNumber)
    const deliveryAddress =
      order.deliveryAddress?.trim() ||
      order.address?.formattedAddress ||
      [order.address?.street, order.address?.additionalDetails, order.address?.city, order.address?.state, order.address?.zipCode]
        .filter(Boolean)
        .join(", ") ||
      "";
    const phoneNumber =
      (order.phoneNumber && String(order.phoneNumber).trim()) ||
      order.userPhone ||
      order.userId?.phone ||
      profile?.phone ||
      defaultAddress?.phone ||
      "";
    if (!deliveryAddress) {
      toast.error("Delivery address is required to update instructions.");
      return;
    }
    if (!phoneNumber) {
      toast.error("Phone number is required. Please add a phone number in your profile.");
      return;
    }
    setIsSavingInstructions(true);
    try {
      const response = await orderAPI.updateDeliveryDetails(orderId, {
        deliveryAddress: deliveryAddress.trim(),
        phoneNumber: phoneNumber.trim(),
        alternatePhone: order.userId?.alternatePhone || defaultAddress?.alternatePhone || "",
        deliveryInstructions: deliveryInstructionsText.trim(),
      });
      if (response.data?.success) {
        setOrder((prev) => (prev ? { ...prev, deliveryInstructions: deliveryInstructionsText.trim() } : prev));
        setShowDeliveryInstructionsDialog(false);
        toast.success("Delivery instructions updated.");
      } else {
        toast.error(response.data?.message || "Failed to update delivery instructions");
      }
    } catch (err) {
      console.error("Error updating delivery instructions:", err);
      toast.error(err.response?.data?.message || "Failed to update delivery instructions");
    } finally {
      setIsSavingInstructions(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const response = await orderAPI.getOrderDetails(orderId)
      if (response.data?.success && response.data.data?.order) {
        const apiOrder = response.data.data.order

        // Extract restaurant location coordinates with multiple fallbacks
        let restaurantCoords = null;

        // Priority 1: restaurantId.location.coordinates (GeoJSON format: [lng, lat])
        if (apiOrder.restaurantId?.location?.coordinates &&
          Array.isArray(apiOrder.restaurantId.location.coordinates) &&
          apiOrder.restaurantId.location.coordinates.length >= 2) {
          restaurantCoords = apiOrder.restaurantId.location.coordinates;
        }
        // Priority 2: restaurantId.location with latitude/longitude properties
        else if (apiOrder.restaurantId?.location?.latitude && apiOrder.restaurantId?.location?.longitude) {
          restaurantCoords = [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude];
        }
        // Priority 3: Check nested restaurant data
        else if (apiOrder.restaurant?.location?.coordinates) {
          restaurantCoords = apiOrder.restaurant.location.coordinates;
        }
        // Priority 4: Check if restaurantId is a string ID and fetch restaurant details
        else if (typeof apiOrder.restaurantId === 'string') {
          console.log('⚠️ restaurantId is a string ID, fetching restaurant details...', apiOrder.restaurantId);
          try {
            const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);
            if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
              const restaurant = restaurantResponse.data.data.restaurant;
              if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {
                restaurantCoords = restaurant.location.coordinates;
                console.log('✅ Fetched restaurant coordinates from API:', restaurantCoords);
              }
            }
          } catch (err) {
            console.error('❌ Error fetching restaurant details:', err);
          }
        }

        const transformedOrder = mapApiOrderToTrackingOrder(apiOrder, restaurantCoords, order)
        setOrder(transformedOrder)
        setOrderStatus(getOrderTrackingStatus(apiOrder))
      }
    } catch (err) {
      console.error('Error refreshing order:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-lg mx-auto text-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </AnimatedPage>
    )
  }

  // Error state
  if (error || !order) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-lg mx-auto text-center py-20">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold mb-4">Order Not Found</h1>
          <p className="text-gray-600 mb-6">{error || 'The order you\'re looking for doesn\'t exist.'}</p>
          <Link to="/user/orders">
            <Button>Back to Orders</Button>
          </Link>
        </div>
      </AnimatedPage>
    )
  }

  const statusConfig = {
    placed: {
      title: "Order placed",
      subtitle: "Waiting for restaurant confirmation",
      color: "bg-green-700"
    },
    preparing: {
      title: "Processing your order",
      subtitle: `Restaurant accepted · Arriving in ${estimatedTime} mins`,
      color: "bg-green-700"
    },
    prepared: {
      title: "Food is ready",
      subtitle: "Waiting for delivery partner to pick up",
      color: "bg-green-700"
    },
    pickup: {
      title: "Order picked up",
      subtitle: `Arriving in ${estimatedTime} mins`,
      color: "bg-green-700"
    },
    delivered: {
      title: "Order delivered",
      subtitle: "Enjoy your meal!",
      color: "bg-green-600"
    },
    cancelled: {
      title: "Order cancelled",
      subtitle: "This order has been cancelled",
      color: "bg-red-600"
    }
  }

  const currentStatus = statusConfig[orderStatus] || statusConfig.placed
  const shouldShowMap = order !== null && !isTerminalOrderStatus(orderStatus)
  const deliveryOtp = order?.deliveryVerification?.otp || ""
  const shouldShowDeliveryOtp = Boolean(deliveryOtp)
  const hasAcceptedPickup = isOrderPickedUp(order)
  const deliveryPartnerName = order?.deliveryPartner?.name || "Delivery Partner"
  const deliveryPartnerPhone = order?.deliveryPartner?.phone || ""
  const deliveryPartnerPhoneLabel = deliveryPartnerPhone || "Phone number not available"
  const deliveryPartnerVehicleType = toTitleCase(order?.deliveryPartner?.vehicleType)
  const deliveryPartnerVehicleNumber = order?.deliveryPartner?.vehicleNumber || ""
  const deliveryPartnerMeta = [deliveryPartnerVehicleType, deliveryPartnerVehicleNumber].filter(Boolean).join(" • ")
  const deliveryPartnerInitial = deliveryPartnerName.trim().charAt(0).toUpperCase() || "D"
  const hasDeliveryPartnerCard = hasAcceptedPickup && Boolean(order?.deliveryPartner)

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#0a0a0a]">
      {/* Green Header */}
      <motion.div
        className={`${currentStatus.color} text-white sticky top-0 z-40`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Navigation bar */}
        <div className="flex items-center justify-between px-4 pt-6 pb-3">
          <Link to="/user/orders">
            <motion.button
              className="w-10 h-10 flex items-center justify-center"
              whileTap={{ scale: 0.9 }}
            >
              <ArrowLeft className="w-6 h-6" />
            </motion.button>
          </Link>
          <h2 className="font-semibold text-lg">{order.restaurant}</h2>
          <motion.button
            onClick={handleShare}
            className="w-10 h-10 flex items-center justify-center"
            whileTap={{ scale: 0.9 }}
          >
            <Share2 className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Status section */}
        <div className="px-4 pb-4 text-center">
          <motion.h1
            className="text-2xl font-bold mb-3"
            key={currentStatus.title}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {currentStatus.title}
          </motion.h1>

          {/* Status pill */}
          <motion.div
            className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span className="text-sm">{currentStatus.subtitle}</span>
            {orderStatus === 'preparing' && (
              <>
                <span className="w-1 h-1 rounded-full bg-white" />
                <span className="text-sm text-green-200">On time</span>
              </>
            )}
            <motion.button
              onClick={handleRefresh}
              className="ml-1"
              animate={{ rotate: isRefreshing ? 360 : 0 }}
              transition={{ duration: 0.5 }}
            >
              <RefreshCw className="w-4 h-4" />
            </motion.button>
          </motion.div>
        </div>
      </motion.div>

      {/* Map Section */}
      {shouldShowMap && (
        <DeliveryMap
          orderId={orderId}
          order={order}
          isVisible={shouldShowMap}
        />
      )}

      {/* Scrollable Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 space-y-4 md:space-y-6 pb-24 md:pb-32">
        {/* Rating Section - Only show when delivered and review not yet submitted */}
        {orderStatus === 'delivered' && !reviewSubmitted && !order?.review?.rating && (
          <motion.div
            className="bg-white rounded-xl p-6 shadow-sm border border-green-100"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">How was your meal?</h2>
              <p className="text-sm text-gray-500 mt-1">Share your experience with us and {order?.restaurant || 'the restaurant'}</p>
            </div>

            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <motion.button
                  key={star}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setRating(star)}
                  className="focus:outline-none"
                >
                  <Star
                    className={`w-10 h-10 ${star <= rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-gray-300"
                      }`}
                  />
                </motion.button>
              ))}
            </div>

            <div className="space-y-4">
              <Textarea
                placeholder="Write a review (optional)"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                className="w-full min-h-[100px] bg-gray-50 border-gray-200 focus:border-green-500 focus:ring-green-500 rounded-xl"
              />

              <Button
                onClick={handleSubmitReview}
                disabled={rating === 0 || isSubmittingReview}
                className="w-full bg-green-600 hover:bg-green-700 text-white h-12 rounded-xl font-bold transition-all shadow-md active:shadow-sm"
              >
                {isSubmittingReview ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Feedback"
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Review Success (if just submitted) */}
        {reviewSubmitted && (
          <motion.div
            className="bg-green-50 border border-green-100 rounded-xl p-6 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-green-900">Feedback Submitted!</h3>
            <p className="text-sm text-green-700 mt-1">Thank you for helping us improve our service.</p>
          </motion.div>
        )}

        {/* Existing review (if already rated and not just submitted) */}
        {order?.review?.rating && !reviewSubmitted && (
          <motion.div
            className="bg-gray-50 border border-gray-100 rounded-xl p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">Your Rating</h3>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${star <= order.review.rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-gray-300"
                      }`}
                  />
                ))}
              </div>
            </div>
            {order.review.comment && (
              <p className="text-sm text-gray-600 italic">"{order.review.comment}"</p>
            )}
          </motion.div>
        )}

        {/* Food Cooking Status - Show until delivery partner accepts pickup */}
        {(() => {
          // Show "Food is Cooking" until delivery partner accepts pickup
          if (['preparing', 'prepared'].includes(orderStatus) && !hasAcceptedPickup) {
            return (
              <motion.div
                className="bg-white rounded-xl p-4 shadow-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center overflow-hidden">
                    <img
                      src={circleIcon}
                      alt="Food cooking"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="font-semibold text-gray-900">Food is Cooking</p>
                </div>
              </motion.div>
            )
          }

          // Don't show card if delivery partner has accepted pickup
          return null
        })()}

        {/* Delivery Partner Safety */}
        <motion.button
          className={`${orderStatus === 'delivered' ? 'hidden' : 'flex'} w-full bg-white rounded-xl p-4 shadow-sm items-center gap-3`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          whileTap={{ scale: 0.99 }}
        >
          <Shield className="w-6 h-6 text-gray-600" />
          <span className="flex-1 text-left font-medium text-gray-900">
            Learn about delivery partner safety
          </span>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </motion.button>

        {/* Delivery Details Banner */}
        <motion.div
          className={`${orderStatus === 'delivered' ? 'hidden' : 'block'} bg-yellow-50 rounded-xl p-4 text-center`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          <p className="text-yellow-800 font-medium">
            All your delivery details in one place 👇
          </p>
        </motion.div>

        {shouldShowDeliveryOtp && (
          <motion.div
            className="rounded-2xl border border-green-100 bg-white p-4 shadow-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.68 }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-700">
                  Share this OTP with your delivery partner
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  Required to confirm prepaid order delivery.
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Do not share this OTP before receiving your order.
                </p>
                <p className="mt-3 text-xs font-medium text-gray-500">
                  Order ID: {order?.id || order?.orderId || 'N/A'}
                </p>
              </div>
              <div className="rounded-xl bg-green-600 px-4 py-3 text-center shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-green-100">
                  OTP
                </p>
                <p className="mt-1 text-2xl font-bold tracking-[0.35em] text-white">
                  {deliveryOtp}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Contact & Address Section */}
        {orderStatus !== 'delivered' && (
          <motion.div
            className="overflow-hidden rounded-[28px] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] ring-1 ring-emerald-100/70"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            {hasDeliveryPartnerCard ? (
              <div className="border-b border-dashed border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-5">
                <div className="mb-4 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700">
                      On the way
                    </p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                      {deliveryPartnerName}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Your delivery partner is heading to your location
                    </p>
                  </div>
                  <motion.button
                    type="button"
                    onClick={handleCallDeliveryPartner}
                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/20"
                    whileTap={{ scale: 0.92 }}
                  >
                    <Phone className="h-5 w-5 text-white" />
                  </motion.button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl bg-emerald-100 text-emerald-800 ring-4 ring-white">
                    {order?.deliveryPartner?.profilePhoto ? (
                      <img
                        src={order.deliveryPartner.profilePhoto}
                        alt={deliveryPartnerName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-semibold">
                        {deliveryPartnerInitial}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                        {deliveryPartnerVehicleType || "Vehicle pending"}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                        {deliveryPartnerVehicleNumber || "Number pending"}
                      </span>
                    </div>
                    <p className="truncate text-sm font-medium text-slate-600">
                      {deliveryPartnerPhoneLabel}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <SectionItem
                icon={Phone}
                title={
                  order?.userName ||
                  order?.userId?.fullName ||
                  order?.userId?.name ||
                  profile?.fullName ||
                  profile?.name ||
                  'Customer'
                }
                subtitle={
                  order?.userPhone ||
                  order?.userId?.phone ||
                  profile?.phone ||
                  defaultAddress?.phone ||
                  'Phone number not available'
                }
                showArrow={false}
              />
            )}
            <motion.button
              type="button"
              onClick={handleOpenDeliveryInstructions}
              className="w-full p-4 text-left transition-colors hover:bg-emerald-50/60"
              whileTap={{ scale: 0.99 }}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-semibold text-slate-900">Delivery instructions</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {order?.deliveryInstructions ? "Saved" : "Optional"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {order?.deliveryInstructions || "Add gate code, landmark, floor, or any note the rider should follow."}
                  </p>
                </div>
              </div>
            </motion.button>
          </motion.div>
        )}

        {/* Chat with delivery partner */}
        {orderStatus !== 'delivered' && hasAssignedDeliveryPartner(order) && (
          <motion.button
            onClick={() => navigate(`/orders/${orderId}/chat`)}
            className="w-full bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 text-left border-0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.72 }}
            whileTap={{ scale: 0.99 }}
          >
            <div className="w-10 h-10 rounded-full bg-[#ff8100]/10 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-[#ff8100]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">Chat with delivery partner</p>
              <p className="text-sm text-gray-500">Message your delivery partner about this order</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
          </motion.button>
        )}

        {/* Restaurant Section */}
        <motion.div
          className="bg-white rounded-xl shadow-sm overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75 }}
        >
          <div className="flex items-center gap-3 p-4 border-b border-dashed border-gray-200">
            <div className="relative w-12 h-12 rounded-full bg-orange-100 overflow-hidden flex items-center justify-center">
              {order?.restaurantImage && (
                <img
                  src={order.restaurantImage}
                  alt={order.restaurant || "Restaurant"}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <span className="text-2xl">🍔</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{order.restaurant}</p>
              <p className="text-sm text-gray-500">{order.address?.city || 'Local Area'}</p>
            </div>
            {orderStatus !== 'delivered' && (
              <motion.button
                type="button"
                onClick={handleCallRestaurant}
                className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"
                whileTap={{ scale: 0.9 }}
              >
                <Phone className="w-5 h-5 text-green-700" />
              </motion.button>
            )}
          </div>

          {/* Order Items */}
          <div className="p-4 border-b border-dashed border-gray-200">
            <div className="flex items-start gap-3">
              <Receipt className="w-5 h-5 text-gray-500 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Order #{order?.id || order?.orderId || 'N/A'}</p>
                <div className="mt-2 space-y-1">
                  {order?.items?.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-4 h-4 rounded border border-green-600 flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-green-600" />
                      </span>
                      <span>{item.quantity} x {item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </motion.div>

        {!isTerminalOrderStatus(orderStatus) && (
          <motion.div
            className="bg-white rounded-xl shadow-sm overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <SectionItem
              icon={CircleSlash}
              title="Cancel order"
              subtitle=""
              onClick={handleCancelOrder}
            />
          </motion.div>
        )}

      </div>

      {/* Delivery Instructions Dialog */}
      <Dialog open={showDeliveryInstructionsDialog} onOpenChange={setShowDeliveryInstructionsDialog}>
        <DialogContent className="w-[95%] max-w-[600px] overflow-hidden rounded-[28px] border-0 bg-white p-0 shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-5 text-xl font-bold text-white">
              Delivery instructions
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-6 py-6">
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
              Add a short note the rider can follow at drop-off, like gate number, landmark, floor, or whether they should call on arrival.
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Visible to your delivery partner
            </p>
            <Textarea
              value={deliveryInstructionsText}
              onChange={(e) => setDeliveryInstructionsText(e.target.value)}
              placeholder="e.g. Leave at the security desk, Call when you arrive"
              className="min-h-[136px] w-full resize-none rounded-3xl border-2 border-amber-300 bg-amber-50/30 px-5 py-4 text-sm leading-6 text-slate-700 shadow-inner shadow-amber-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 focus:outline-none disabled:bg-gray-100"
              disabled={isSavingInstructions}
            />
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowDeliveryInstructionsDialog(false)}
                disabled={isSavingInstructions}
                className="h-12 flex-1 rounded-2xl border-slate-200 text-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveDeliveryInstructions}
                disabled={isSavingInstructions}
                className="h-12 flex-1 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {isSavingInstructions ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-xl w-[95%] max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              Cancel Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-6 px-4">
            <div className="space-y-2 w-full">
              <Textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="e.g., Changed my mind, Wrong address, etc."
                className="w-full min-h-[100px] resize-none border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200 text-gray-900 dark:text-gray-100"
                disabled={isCancelling}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCancelDialog(false);
                  setCancellationReason("");
                }}
                disabled={isCancelling}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmCancel}
                disabled={isCancelling || !cancellationReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Confirm Cancellation'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
