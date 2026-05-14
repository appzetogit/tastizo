import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { restaurantAPI } from "@food/api"
import {
  setAuthData as setRestaurantAuthData,
  setRestaurantPendingPhone,
  clearRestaurantPendingPhone,
} from "@food/utils/auth"
import { checkOnboardingStatus, isRestaurantOnboardingComplete } from "@food/utils/onboardingUtils"

const OTP_LENGTH = 4
const BRAND_GREEN = "#2A9C64"

export default function RestaurantOTP() {
  const navigate = useNavigate()
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(""))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("")
  const inputRefs = useRef([])
  const hasSubmittedRef = useRef(false)

  useEffect(() => {
    const stored = sessionStorage.getItem("restaurantAuthData")
    if (!stored) {
      navigate("/food/restaurant/login", { replace: true })
      return
    }

    const data = JSON.parse(stored)
    setAuthData(data)

    if (data.method === "email" && data.email) {
      setContactInfo(data.email)
    } else if (data.phone) {
      const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
      if (phoneMatch) {
        const formattedPhone = `${phoneMatch[1]}-${phoneMatch[2].replace(/\D/g, "")}`
        setContactInfo(formattedPhone)
      } else {
        setContactInfo(data.phone || "")
      }
    }

    setResendTimer(59)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [navigate])

  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [])

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) {
      return
    }

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    if (newOtp.every((digit) => digit !== "") && !hasSubmittedRef.current) {
      hasSubmittedRef.current = true
      handleVerify(newOtp.join(""))
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }

    if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      navigator.clipboard.readText().then((text) => {
        const digits = text.replace(/\D/g, "").slice(0, OTP_LENGTH).split("")
        const newOtp = [...otp]
        digits.forEach((digit, digitIndex) => {
          if (digitIndex < OTP_LENGTH) {
            newOtp[digitIndex] = digit
          }
        })
        setOtp(newOtp)
        setError("")

        if (digits.length === OTP_LENGTH && !hasSubmittedRef.current) {
          hasSubmittedRef.current = true
          handleVerify(newOtp.join(""))
        } else {
          inputRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus()
        }
      })
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, OTP_LENGTH).split("")
    const newOtp = [...otp]
    digits.forEach((digit, index) => {
      if (index < OTP_LENGTH) {
        newOtp[index] = digit
      }
    })
    setOtp(newOtp)
    setError("")

    if (digits.length === OTP_LENGTH && !hasSubmittedRef.current) {
      hasSubmittedRef.current = true
      handleVerify(newOtp.join(""))
    } else {
      inputRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus()
    }
  }

  const handleVerify = async (otpValue = null) => {
    const code = (otpValue || otp.join("")).replace(/\D/g, "").slice(0, OTP_LENGTH)

    if (code.length !== OTP_LENGTH) {
      setError("OTP must be exactly 4 digits")
      hasSubmittedRef.current = false
      return
    }

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please login again.")
      }

      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      const purpose = authData.isSignUp ? "register" : "login"

      const response = await restaurantAPI.verifyOTP(phone, code, purpose, null, email)
      const data = response?.data?.data || response?.data || {}

      if (data.pendingApproval === true && !data.isRejected) {
        const pendingPhone = data.phone || phone || authData?.email || contactInfo
        setRestaurantPendingPhone(pendingPhone)
        sessionStorage.removeItem("restaurantAuthData")
        navigate("/food/restaurant/pending-verification", {
          replace: true,
          state: { phone: pendingPhone || "" },
        })
        return
      }

      if (data.isRejected) {
        throw new Error(data.message || "Your restaurant registration has been rejected. Please contact support.")
      }

      if (data?.needsRegistration) {
        setRestaurantPendingPhone(data.phone || phone)
        sessionStorage.removeItem("restaurantAuthData")
        navigate("/food/restaurant/onboarding", { replace: true })
        return
      }

      const accessToken = data?.accessToken
      const restaurant = data?.user ?? data?.restaurant

      if (!accessToken || !restaurant) {
        throw new Error("Invalid response from server")
      }

      setRestaurantAuthData("restaurant", accessToken, restaurant, data?.refreshToken)
      clearRestaurantPendingPhone()
      window.dispatchEvent(new Event("restaurantAuthChanged"))
      sessionStorage.removeItem("restaurantAuthData")

      setTimeout(async () => {
        const onboardingComplete = isRestaurantOnboardingComplete(restaurant)
        if (!onboardingComplete) {
          const incompleteStep = await checkOnboardingStatus()
          if (incompleteStep) {
            navigate(`/food/restaurant/onboarding?step=${incompleteStep}`, { replace: true })
            return
          }
        }
        navigate("/food/restaurant", { replace: true })
      }, 500)
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Invalid OTP. Please try again."

      if (/pending approval/i.test(message)) {
        const pendingPhone = authData?.phone || authData?.email || contactInfo
        setRestaurantPendingPhone(pendingPhone)
        navigate("/food/restaurant/pending-verification", {
          replace: true,
          state: { phone: pendingPhone || "" },
        })
        return
      }

      setError(message)
      setOtp(Array(OTP_LENGTH).fill(""))
      hasSubmittedRef.current = false
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0 || isLoading) return

    setIsLoading(true)
    setError("")

    try {
      const purpose = authData?.isSignUp ? "register" : "login"
      await restaurantAPI.sendOTP(authData?.phone, purpose, authData?.email)
      setResendTimer(59)
      setOtp(Array(OTP_LENGTH).fill(""))
      hasSubmittedRef.current = false
      inputRefs.current[0]?.focus()
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to resend OTP. Please try again."
      )
    } finally {
      setIsLoading(false)
    }
  }

  if (!authData) {
    return null
  }

  return (
    <AnimatedPage className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[390px] flex-col bg-white">
        <div className="flex items-center border-b border-[#e9e9e9] px-5 py-5">
          <button
            onClick={() => navigate("/food/restaurant/login")}
            className="p-1"
            aria-label="Go back"
          >
            <ArrowLeft className="h-6 w-6 text-black" />
          </button>
          <span className="flex-1 pr-7 text-center text-[1.85rem] font-bold tracking-[-0.03em] text-black">
            OTP Verification
          </span>
          <span className="w-7 shrink-0" aria-hidden="true" />
        </div>

        <div className="flex flex-1 flex-col px-7 pt-10 pb-8">
          <div className="text-center">
            <div className="space-y-3">
              <h2 className="text-[1.05rem] font-medium leading-7 text-black">
                We have sent a verification code to
              </h2>
              <p className="text-[1.05rem] font-semibold text-black">{contactInfo}</p>
            </div>
          </div>

          <div className="mt-16">
            <div className="flex justify-center gap-2.5">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  disabled={isLoading}
                  aria-label={`OTP digit ${index + 1} of 4`}
                  className="h-14 w-12 rounded-[0.95rem] border-[2.25px] border-black bg-white text-center text-[1.35rem] font-semibold text-black outline-none transition-all focus:border-black"
                  style={{ boxShadow: "none" }}
                />
              ))}
            </div>

            {error && (
              <div className="mt-5 flex items-center justify-center gap-1.5 rounded-lg bg-red-50 py-2 text-xs text-red-500">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="mt-12 text-center">
              <p className="text-[1.05rem] font-medium text-black">Didn&apos;t get the SMS?</p>
              <p className="mt-1 text-[1rem] text-[#6a6a6a]">
                {resendTimer > 0 ? (
                  <span>Resend SMS in {resendTimer}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isLoading}
                    className="font-medium transition-colors disabled:opacity-50"
                    style={{ color: BRAND_GREEN }}
                  >
                    Resend SMS
                  </button>
                )}
              </p>
            </div>
          </div>

          {isLoading && (
            <div className="mt-6 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND_GREEN }} />
            </div>
          )}

          <div className="mt-auto pt-10 text-center">
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/login")}
              className="text-[1.05rem] font-medium"
              style={{ color: BRAND_GREEN }}
            >
              Go back to login
            </button>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}
