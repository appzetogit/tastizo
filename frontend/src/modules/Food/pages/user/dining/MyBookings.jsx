import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { ArrowLeft, Calendar, Clock, Users, MapPin, ChevronRight, Utensils, Loader2, CheckCircle2, Tag, Trash2 } from "lucide-react"
import { diningAPI } from "@food/api"
import { initRazorpayPayment } from "@food/utils/razorpay"
import Loader from "@food/components/Loader"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Badge } from "@food/components/ui/badge"
import { Star, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@food/components/ui/button"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


function ReviewModal({ booking, onClose, onSubmit }) {
    const [rating, setRating] = useState(5)
    const [comment, setComment] = useState("")
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async () => {
        if (!comment.trim()) {
            toast.error("Please add a comment")
            return
        }
        setSubmitting(true)
        await onSubmit({ bookingId: booking._id, rating, comment })
        setSubmitting(false)
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900">Review your experience</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="flex flex-col items-center">
                        <p className="text-sm font-medium text-slate-500 mb-3">How was your visit to {booking.restaurant?.name}?</p>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    onClick={() => setRating(star)}
                                    className="p-1 transition-transform active:scale-90"
                                >
                                    <Star
                                        className={`w-10 h-10 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-slate-200"
                                            }`}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Share your feedback</label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Write about the food, service, and atmosphere..."
                            className="w-full h-32 p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-red-500 transition-all text-sm resize-none"
                        />
                    </div>

                    <Button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="w-full bg-red-500 hover:bg-red-600 text-white font-bold h-12 rounded-2xl shadow-lg shadow-red-200"
                    >
                        {submitting ? "Submitting..." : "Submit Review"}
                    </Button>
                </div>
            </div>
        </div>
    )
}

function RazorpaySimulatorModal({ booking, onClose, onSuccess }) {
    const [step, setStep] = useState(booking.billStatus === "paid" ? "success" : "select") // "select", "card", "upi", "processing", "success"
    const [paymentMethod, setPaymentMethod] = useState("")
    const [cardNo, setCardNo] = useState("")
    const [expiry, setExpiry] = useState("")
    const [cvv, setCvv] = useState("")
    const [upiId, setUpiId] = useState("")

    const handlePay = async () => {
        setStep("processing")
        setTimeout(async () => {
            await onSuccess()
            setStep("success")
        }, 2000)
    }

    const commissionAmt = booking.commissionAmount ?? Number((booking.billAmount * ((booking.commissionPct ?? 10) / 100)).toFixed(2))
    const restaurantAmt = Number((booking.billAmount - commissionAmt).toFixed(2))

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100">
                {/* Header */}
                <div className="bg-[#1E293B] p-6 text-white relative">
                    <button 
                        onClick={onClose} 
                        className="absolute right-4 top-4 p-1.5 hover:bg-slate-800 rounded-full transition-colors"
                        disabled={step === "processing"}
                    >
                        <X className="w-5 h-5 text-slate-300" />
                    </button>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="bg-indigo-600 px-2 py-0.5 rounded text-white font-bold text-[10px] uppercase tracking-wider">
                            Razorpay
                        </div>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">Secure Checkout</span>
                    </div>
                    <h3 className="text-lg font-black truncate pr-6">{booking.restaurant?.name || 'Tastizo Dining'}</h3>
                    <div className="mt-4 flex items-baseline justify-between border-t border-slate-700/50 pt-4">
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Amount to Pay</span>
                        <span className="text-2xl font-black text-emerald-400">₹{booking.billAmount}</span>
                    </div>
                </div>

                {/* Content */}
                {step === "select" && (
                    <div className="p-6 space-y-4">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select Payment Method</p>
                        
                        <button 
                            onClick={() => { setPaymentMethod("card"); setStep("card"); }}
                            className="w-full p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl flex items-center justify-between border border-slate-100 transition-all active:scale-98"
                        >
                            <span className="font-bold text-slate-700 text-sm">Card (Visa, Mastercard, RuPay)</span>
                            <span className="text-xs text-indigo-600 font-extrabold uppercase">Select</span>
                        </button>

                        <button 
                            onClick={() => { setPaymentMethod("upi"); setStep("upi"); }}
                            className="w-full p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl flex items-center justify-between border border-slate-100 transition-all active:scale-98"
                        >
                            <span className="font-bold text-slate-700 text-sm">UPI (GPay, PhonePe, Paytm)</span>
                            <span className="text-xs text-indigo-600 font-extrabold uppercase">Select</span>
                        </button>

                        <button 
                            onClick={handlePay}
                            className="w-full p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl flex items-center justify-between border border-slate-100 transition-all active:scale-98"
                        >
                            <span className="font-bold text-slate-700 text-sm">Net Banking</span>
                            <span className="text-xs text-indigo-600 font-extrabold uppercase">Instant Pay</span>
                        </button>
                    </div>
                )}

                {step === "card" && (
                    <div className="p-6 space-y-4">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Enter Card Details</h4>
                        
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Card Number</label>
                            <input 
                                type="text"
                                placeholder="1234 5678 9012 3456"
                                value={cardNo}
                                onChange={(e) => setCardNo(e.target.value.replace(/\D/g, "").slice(0, 16))}
                                className="w-full p-3 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm border-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Expiry</label>
                                <input 
                                    type="text"
                                    placeholder="MM/YY"
                                    value={expiry}
                                    onChange={(e) => setExpiry(e.target.value.slice(0, 5))}
                                    className="w-full p-3 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm border-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">CVV</label>
                                <input 
                                    type="password"
                                    placeholder="123"
                                    value={cvv}
                                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 3))}
                                    className="w-full p-3 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm border-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => setStep("select")}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors text-sm"
                            >
                                Back
                            </button>
                            <button 
                                onClick={handlePay}
                                disabled={cardNo.length < 16}
                                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-100"
                            >
                                Pay Securely
                            </button>
                        </div>
                    </div>
                )}

                {step === "upi" && (
                    <div className="p-6 space-y-4">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Enter UPI ID</h4>
                        
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">UPI ID (VPA)</label>
                            <input 
                                type="text"
                                placeholder="username@upi"
                                value={upiId}
                                onChange={(e) => setUpiId(e.target.value)}
                                className="w-full p-3 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm border-none bg-slate-50"
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => setStep("select")}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors text-sm"
                            >
                                Back
                            </button>
                            <button 
                                onClick={handlePay}
                                disabled={!upiId.includes("@")}
                                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-100"
                            >
                                Pay Securely
                            </button>
                        </div>
                    </div>
                )}

                {step === "processing" && (
                    <div className="p-10 flex flex-col items-center justify-center space-y-4 text-center">
                        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                        <h4 className="text-base font-black text-slate-800">Processing Secure Payment</h4>
                        <p className="text-xs text-slate-500 max-w-[250px]">Please do not refresh this page or press back.</p>
                    </div>
                )}

                {step === "success" && (
                    <div className="p-8 flex flex-col items-center justify-center space-y-6 text-center animate-in fade-in zoom-in duration-300">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                            <CheckCircle2 className="w-10 h-10" />
                        </div>
                        <div>
                            <h4 className="text-xl font-black text-slate-900 mb-1">Transaction Successful</h4>
                            <p className="text-xs text-slate-500">Your dining bill has been settled successfully.</p>
                        </div>

                        {/* Split Details Ledger */}
                        <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left space-y-2.5">
                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200/60 pb-1.5 mb-2">Ledger Breakdown</h5>
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-slate-500">Dining Bill Amount</span>
                                <span className="font-black text-slate-900">₹{booking.billAmount}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-slate-500">Admin Commission ({booking.commissionPct ?? 10}%)</span>
                                <span className="font-black text-indigo-600">₹{commissionAmt}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs border-t border-slate-200/50 pt-2 mt-1">
                                <span className="font-bold text-slate-600">Restaurant Payout</span>
                                <span className="font-black text-emerald-600">₹{restaurantAmt}</span>
                            </div>
                        </div>

                        <Button 
                            onClick={onClose}
                            className="w-full bg-[#1E293B] hover:bg-slate-800 text-white font-bold py-3 rounded-2xl text-sm"
                        >
                            Paid Successfully
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default function MyBookings() {
    const navigate = useNavigate()
    const [bookings, setBookings] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedBooking, setSelectedBooking] = useState(null)
    const [activePaymentBooking, setActivePaymentBooking] = useState(null)
    // Coupon state: keyed by bookingId
    const [couponInputs, setCouponInputs] = useState({})
    const [couponLoading, setCouponLoading] = useState({})
    const [appliedCoupons, setAppliedCoupons] = useState({})

    const getStatusLabel = (status) => {
        const key = String(status || "").toLowerCase()
        if (key === "pending") return "Approval Reqd"
        if (key === "accepted" || key === "confirmed") return "Confirmed"
        if (key === "checked-in") return "Checked-in"
        if (key === "completed") return "Completed"
        if (key === "cancelled") return "Cancelled"
        return String(status || "unknown")
    }

    const getStatusBadgeClass = (status) => {
        const key = String(status || "").toLowerCase()
        if (key === "pending") return "bg-amber-100 text-amber-700"
        if (key === "accepted" || key === "confirmed") return "bg-green-100 text-green-700 font-bold"
        if (key === "checked-in") return "bg-[#F9F9FB] text-[#2A9C64]"
        if (key === "completed") return "bg-blue-100 text-blue-700"
        if (key === "cancelled") return "bg-red-100 text-red-700"
        return "bg-slate-100 text-slate-700"
    }

    useEffect(() => {
        const fetchBookings = async () => {
            try {
                const response = await diningAPI.getBookings()
                if (response.data.success) {
                    setBookings(response.data.data)
                }
            } catch (error) {
                debugError("Error fetching bookings:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchBookings()
    }, [])

    const handleReviewSubmit = async (reviewData) => {
        try {
            const response = await diningAPI.createReview(reviewData)
            if (response.data.success) {
                toast.success("Review submitted! Thank you for your feedback.")
                // Update booking list to mark it as reviewed if we had a reviewed flag
                // For now just close the modal
                setSelectedBooking(null)
            }
        } catch (error) {
            debugError("Error submitting review:", error)
            toast.error(error.response?.data?.message || "Failed to submit review")
        }
    }

    const handleApplyCoupon = async (booking) => {
        const code = (couponInputs[booking._id] || "").trim()
        if (!code) { toast.error("Please enter a coupon code"); return }
        const bookingId = booking._id
        setCouponLoading(prev => ({ ...prev, [bookingId]: true }))
        try {
            const restaurantId = booking.restaurant?._id || booking.restaurant?.id || booking.restaurantId
            const res = await diningAPI.validateDiningCoupon(code, booking.billAmount, restaurantId)
            if (res.data?.success) {
                const d = res.data.data
                setAppliedCoupons(prev => ({ ...prev, [bookingId]: d }))
                toast.success(`Coupon applied! You save ₹${d.discountAmount}`)
            } else {
                toast.error(res.data?.message || "Invalid coupon")
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || "Invalid coupon code")
        } finally {
            setCouponLoading(prev => ({ ...prev, [bookingId]: false }))
        }
    }

    const handleRemoveCoupon = (bookingId) => {
        setAppliedCoupons(prev => { const n = { ...prev }; delete n[bookingId]; return n })
        setCouponInputs(prev => ({ ...prev, [bookingId]: "" }))
        toast.info("Coupon removed")
    }

    const handlePayBill = async (bookingId) => {
        try {
            const coupon = appliedCoupons[bookingId]
            const couponCode = coupon?.couponCode || null
            const response = await diningAPI.payDiningBill(bookingId, couponCode)
            if (response.data.success) {
                const updatedBooking = response?.data?.data || null
                setBookings(prev => prev.map(b =>
                    b._id === bookingId ? {
                        ...b,
                        billStatus: "paid",
                        billPaidAt: updatedBooking?.billPaidAt || new Date().toISOString(),
                        restaurantPayout: updatedBooking?.restaurantPayout ?? b?.restaurantPayout
                    } : b
                ))
                // Clear coupon state for this booking
                setAppliedCoupons(prev => { const n = { ...prev }; delete n[bookingId]; return n })
                setCouponInputs(prev => { const n = { ...prev }; delete n[bookingId]; return n })
                toast.success("Bill paid successfully! Thank you.")
            }
        } catch (error) {
            debugError("Error paying bill:", error)
            toast.error("Failed to pay bill")
        }
    }

    const handlePayBillWithRealRazorpay = async (booking) => {
        try {
            toast.loading("Initializing secure Razorpay payment...", { id: "razorpay-init" })
            
            let userInfo = {}
            try {
                const storedUser = localStorage.getItem("user_info")
                if (storedUser) {
                    userInfo = JSON.parse(storedUser)
                }
            } catch (e) {}

            const coupon = appliedCoupons[booking._id]
            const payAmount = coupon ? coupon.finalAmount : booking.billAmount
            const userName = userInfo.name || booking.guestName || "Dining Guest"
            const userEmail = userInfo.email || "guest@tastizo.com"
            const userPhone = (userInfo.phone || "9999999999").replace(/\D/g, "").slice(-10)

            await initRazorpayPayment({
                key: "rzp_test_SiDMCPfJWp5SWc",
                amount: Math.round(Number(payAmount) * 100),
                currency: "INR",
                name: "Tastizo Dining",
                description: `Bill Payment - ${booking.restaurant?.name || 'Restaurant'}`,
                prefill: {
                    name: userName,
                    email: userEmail,
                    contact: userPhone
                },
                notes: {
                    type: "dining_bill_payment",
                    bookingId: booking._id
                },
                handler: async (response) => {
                    toast.dismiss("razorpay-init")
                    toast.success("Payment successful! Settling transaction...")
                    
                    await handlePayBill(booking._id)
                    
                    setActivePaymentBooking({
                        ...booking,
                        billStatus: "paid",
                        razorpayPaymentId: response.razorpay_payment_id
                    })
                },
                onError: (error) => {
                    toast.dismiss("razorpay-init")
                    toast.error(error?.description || "Payment failed or cancelled")
                },
                onClose: () => {
                    toast.dismiss("razorpay-init")
                }
            })
        } catch (error) {
            toast.dismiss("razorpay-init")
            debugError("Error launching Razorpay:", error)
            toast.error("Could not load payment gateway")
        }
    }

    if (loading) return <Loader />

    return (
        <AnimatedPage className="bg-slate-50 min-h-screen pb-10">
            {/* Header */}
            <div className="bg-white p-4 flex items-center shadow-sm sticky top-0 z-10">
                <button onClick={() => navigate("/")}>
                    <ArrowLeft className="w-6 h-6 text-gray-700 cursor-pointer" />
                </button>
                <h1 className="ml-4 text-xl font-semibold text-gray-800">My Table Bookings</h1>
            </div>

            <div className="p-4 space-y-4">
                {bookings.length > 0 ? (
                    bookings.map((booking) => (
                        <div key={booking._id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-start gap-4">
                            <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
                                <img
                                    src={booking.restaurant?.image || booking.restaurant?.profileImage?.url || ""}
                                    className="w-full h-full object-cover"
                                    alt={booking.restaurant?.name}
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none'
                                    }}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-gray-900 truncate">{booking.restaurant?.name}</h3>
                                    <Badge className={getStatusBadgeClass(booking.status)}>
                                        {getStatusLabel(booking.status)}
                                    </Badge>
                                </div>
                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                    <MapPin className="w-3 h-3" />
                                    <span className="truncate">
                                        {typeof booking.restaurant?.location === 'string'
                                            ? booking.restaurant.location
                                            : (booking.restaurant?.location?.formattedAddress || booking.restaurant?.location?.address || `${booking.restaurant?.location?.city || ''}${booking.restaurant?.location?.area ? ', ' + booking.restaurant.location.area : ''}`)}
                                    </span>
                                </p>

                                <div className="flex items-center gap-4 mt-3">
                                    <div className="flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(booking.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                                        <Clock className="w-3 h-3" />
                                        {booking.timeSlot}
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                                        <Users className="w-3 h-3" />
                                        {booking.guests} Guests
                                    </div>
                                </div>

                                 {booking.status === 'completed' && (
                                     <div className="flex flex-col gap-2 mt-3 border-t border-slate-100 pt-3">
                                         {booking.billAmount ? (
                                             <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-2">
                                                 <div className="flex flex-col">
                                                     <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dining Bill</span>
                                                     <span className="text-sm font-black text-slate-800">₹{booking.billAmount}</span>
                                                 </div>
                                                 {booking.billStatus === 'paid' ? (
                                                     <div className="flex flex-col items-end gap-1.5">
                                                         <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-bold uppercase py-1 px-2.5 rounded-lg text-[9px] tracking-wider border-none shadow-sm">
                                                             PAID
                                                         </Badge>
                                                         <div className="text-[10px] text-slate-500 font-medium text-right mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                             <div>Admin Fee ({booking.commissionPct ?? 10}%): <span className="font-bold text-indigo-600">₹{(booking.billAmount * ((booking.commissionPct ?? 10) / 100)).toFixed(2)}</span></div>
                                                             <div>Restaurant Payout: <span className="font-bold text-emerald-600">₹{(booking.billAmount - (booking.billAmount * ((booking.commissionPct ?? 10) / 100))).toFixed(2)}</span></div>
                                                         </div>
                                                     </div>
                                                 ) : (
                                                     <div className="flex flex-col gap-2 items-end">
                                                         {/* Coupon Input */}
                                                         {!appliedCoupons[booking._id] ? (
                                                             <div className="flex items-center gap-1.5 w-full">
                                                                 <div className="relative flex-1">
                                                                     <Tag className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                                                     <input
                                                                         type="text"
                                                                         placeholder="Coupon code"
                                                                         value={couponInputs[booking._id] || ""}
                                                                         onChange={(e) => setCouponInputs(prev => ({ ...prev, [booking._id]: e.target.value.toUpperCase() }))}
                                                                         className="w-full pl-7 pr-2 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 uppercase tracking-wider"
                                                                     />
                                                                 </div>
                                                                 <button
                                                                     onClick={() => handleApplyCoupon(booking)}
                                                                     disabled={couponLoading[booking._id]}
                                                                     className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg disabled:opacity-50 whitespace-nowrap"
                                                                 >
                                                                     {couponLoading[booking._id] ? "..." : "APPLY"}
                                                                 </button>
                                                             </div>
                                                         ) : (
                                                             <div className="w-full bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center justify-between">
                                                                 <div className="flex items-center gap-1.5">
                                                                     <Tag className="w-3 h-3 text-emerald-600" />
                                                                     <span className="text-[10px] font-bold text-emerald-700">{appliedCoupons[booking._id].couponCode}</span>
                                                                     <span className="text-[10px] font-bold text-emerald-600">-₹{appliedCoupons[booking._id].discountAmount}</span>
                                                                 </div>
                                                                 <button onClick={() => handleRemoveCoupon(booking._id)} className="p-0.5 hover:bg-emerald-100 rounded">
                                                                     <Trash2 className="w-3 h-3 text-red-400" />
                                                                 </button>
                                                             </div>
                                                         )}
                                                         {/* Show discounted amount */}
                                                         {appliedCoupons[booking._id] && (
                                                             <div className="text-[10px] text-right w-full">
                                                                 <span className="text-slate-400 line-through mr-1">₹{booking.billAmount}</span>
                                                                 <span className="font-black text-emerald-600">₹{appliedCoupons[booking._id].finalAmount}</span>
                                                             </div>
                                                         )}
                                                         <Button
                                                             onClick={() => handlePayBillWithRealRazorpay(booking)}
                                                             className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-8 px-4 rounded-xl text-xs shadow-md shadow-indigo-100 animate-pulse w-full"
                                                         >
                                                             PAY {appliedCoupons[booking._id] ? `₹${appliedCoupons[booking._id].finalAmount}` : 'NOW'}
                                                         </Button>
                                                     </div>
                                                 )}
                                             </div>
                                         ) : (
                                             <span className="text-[10px] font-bold text-slate-400 italic mb-2 block">
                                                 Waiting for restaurant to upload bill...
                                             </span>
                                         )}
                                         <button
                                             onClick={() => setSelectedBooking(booking)}
                                             className="w-full py-2 bg-red-50 text-red-600 text-[11px] font-bold rounded-lg border border-red-100 hover:bg-red-100 transition-colors"
                                         >
                                             RATE & REVIEW
                                         </button>
                                     </div>
                                 )}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-20">
                        <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Utensils className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800">No bookings yet</h3>
                        <p className="text-gray-500 text-sm mt-2">Book your favorite restaurant for a great dining experience!</p>
                        <Link to="/dining">
                            <button className="mt-6 bg-red-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-red-200">
                                Book a table
                            </button>
                        </Link>
                    </div>
                )}
            </div>

            {selectedBooking && (
                <ReviewModal
                    booking={selectedBooking}
                    onClose={() => setSelectedBooking(null)}
                    onSubmit={handleReviewSubmit}
                />
            )}

            {activePaymentBooking && (
                <RazorpaySimulatorModal
                    booking={activePaymentBooking}
                    onClose={() => setActivePaymentBooking(null)}
                    onSuccess={async () => {
                        await handlePayBill(activePaymentBooking._id)
                    }}
                />
            )}
        </AnimatedPage>
    )
}

