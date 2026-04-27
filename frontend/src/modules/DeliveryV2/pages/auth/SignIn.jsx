import { useState, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { motion } from "framer-motion"
import { ShieldCheck, Truck, Star, Heart, ArrowRight, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { deliveryAPI } from "@food/api"
import { clearModuleAuth } from "@food/utils/auth"
import logoNew from "@/assets/logo.png"

const DEFAULT_COUNTRY_CODE = "+91"

export default function DeliverySignIn() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState(() => {
    const stored = sessionStorage.getItem("deliveryAuthData")
    if (stored) {
      try {
        const data = JSON.parse(stored)
        return data.phone ? data.phone.replace("+91", "").trim() : ""
      } catch (e) { return "" }
    }
    return ""
  })
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)

  const validatePhone = (num) => {
    const digits = num.replace(/\D/g, "")
    return digits.length === 10 && ["6", "7", "8", "9"].includes(digits[0])
  }

  const handleSendOTP = async (e) => {
    if (e) e.preventDefault()
    if (!validatePhone(phone)) {
      toast.error("Please enter a valid 10-digit mobile number")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)

    const fullPhone = `${DEFAULT_COUNTRY_CODE} ${phone}`.trim()

    try {
      clearModuleAuth("delivery")
      await deliveryAPI.sendOTP(fullPhone, "login")

      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        purpose: "login",
        module: "delivery",
      }
      sessionStorage.setItem("deliveryAuthData", JSON.stringify(authData))
      toast.success("Verification code sent to your phone!")
      navigate("/food/delivery/otp")
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to send OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  return (
    <div className="min-h-screen bg-[#2A9C64] flex flex-col relative font-['Poppins']">

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-[440px]"
        >
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="relative inline-block mb-4"
            >
              <img 
                src={logoNew} 
                alt="Tastizo Logo" 
                className="w-32 h-32 md:w-36 md:h-36 object-contain mx-auto"
              />
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-gray-400 dark:text-gray-500 font-bold text-xs uppercase tracking-[0.3em]"
            >
              DELIVERY PARTNER
            </motion.p>
          </div>

          {/* Login Card */}
          <div className="bg-white rounded-2xl p-8 sm:p-12 shadow-lg border border-gray-100">

            <div className="mb-10 text-center sm:text-left">
              <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2 font-['Outfit'] tracking-tight">
                Partner Sign In
              </h2>
              <div className="h-1 w-10 bg-[#2A9C64] rounded-full mb-3 hidden sm:block" />
              <p className="text-base text-gray-500 dark:text-gray-400 font-medium">
                Enter your registered mobile number to start earning
              </p>
            </div>

            <form onSubmit={handleSendOTP} className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#2A9C64] uppercase tracking-[0.2em] ml-1">Mobile Number</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                    <span className="text-sm font-bold text-[#2A9C64] border-r border-gray-200 dark:border-gray-800 pr-3">+91</span>
                  </div>
                  <input
                    type="tel"
                    required
                    autoFocus
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    maxLength={10}
                    className="block w-full pl-16 pr-6 py-4 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white border-2 border-transparent focus:border-[#2A9C64]/50 rounded-2xl outline-none transition-all placeholder:text-gray-300 font-bold text-lg shadow-sm"
                    placeholder="00000 00000"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || phone.length < 10}
                className="w-full py-4.5 bg-[#2A9C64] hover:bg-[#6a2f56] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-2xl font-bold text-lg shadow-xl shadow-[#2A9C64]/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group overflow-hidden relative"
              >
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <span>Continue Delivery</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
                <motion.div
                  className="absolute inset-0 bg-white/20 translate-x-[-100%]"
                  whileHover={{ translateX: "100%" }}
                  transition={{ duration: 0.6 }}
                />
              </button>
            </form>
          </div>

          {/* Footer Info */}
          <div className="mt-8 text-center">
            <p className="text-[11px] text-gray-400 font-medium leading-relaxed max-w-[320px] mx-auto">
              By continuing, you agree to Tastizo's <br />
              <Link to="/food/delivery/terms" className="text-gray-900 dark:text-white font-bold hover:text-[#2A9C64] transition-colors">Terms and Conditions</Link>
            </p>
          </div>

          <div className="mt-12 flex justify-center items-center gap-6 opacity-30 grayscale hover:opacity-60 transition-opacity">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Safe & Secure</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Heart className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Earning Opportunities</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

