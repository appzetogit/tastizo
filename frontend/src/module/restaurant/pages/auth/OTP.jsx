import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { restaurantAPI } from "@/lib/api"
import { setAuthData as setRestaurantAuthData, isModuleAuthenticated } from "@/lib/utils/auth"
import { checkOnboardingStatus } from "../../utils/onboardingUtils"

export default function RestaurantOTP() {
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("") // Can be phone or email
  const [contactType, setContactType] = useState("phone") // "phone" or "email"
  const [focusedIndex, setFocusedIndex] = useState(null)
  const inputRefs = useRef([])

  useEffect(() => {
    // Redirect to home if already authenticated
    // Redirect to home if already authenticated
    if (isModuleAuthenticated("restaurant")) {
      navigate("/restaurant", { replace: true })
      return
    }

    // Get auth data from sessionStorage
    const stored = sessionStorage.getItem("restaurantAuthData")
    if (!stored) {
      navigate("/restaurant/login", { replace: true })
      return
    }
    const data = JSON.parse(stored)
    setAuthData(data)

    if (data.method === "email" && data.email) {
      setContactType("email")
      setContactInfo(data.email)
    } else if (data.phone) {
      setContactType("phone")
      const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
      if (phoneMatch) {
        setContactInfo(`${phoneMatch[1]}-${phoneMatch[2].replace(/\D/g, "")}`)
      } else {
        setContactInfo(data.phone || "")
      }
    }

    startResendTimer()
  }, [navigate])

  const startResendTimer = () => {
    setResendTimer(60)
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
  }

  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [])

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    if (newOtp.every((digit) => digit !== "") && newOtp.length === 6) {
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
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text") || ""
    const digits = pastedData.replace(/\D/g, "").slice(0, 6).split("")

    if (digits.length === 0) return

    const newOtp = [...otp]
    digits.forEach((digit, i) => {
      if (i < 6) newOtp[i] = digit
    })
    setOtp(newOtp)

    if (digits.length === 6) {
      handleVerify(newOtp.join(""))
    } else {
      const nextIndex = Math.min(digits.length, 5)
      inputRefs.current[nextIndex]?.focus()
    }
  }

  const handleVerify = async (otpValue = null) => {
    const code = otpValue || otp.join("")

    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please try logging in again.")
      }

      // Determine identifier type (phone or email)
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      const purpose = authData.isSignUp ? "register" : "login"

      // Don't ask for name on OTP page: use placeholder for new signups so we can redirect to onboarding
      const nameToSend = authData.isSignUp ? "Restaurant" : null

      const response = await restaurantAPI.verifyOTP(phone, code, purpose, nameToSend, email)

      // Extract restaurant and token or special flags (like needsName) from backend response
      let data = response?.data?.data || response?.data

      // If backend says we need a name (login but restaurant not found), auto-register with placeholder and redirect to onboarding
      if (data?.needsName) {
        const retryResponse = await restaurantAPI.verifyOTP(phone, code, "login", "Restaurant", email)
        data = retryResponse?.data?.data || retryResponse?.data
        if (data?.needsName) {
          setError("Unable to create account. Please try again.")
          setIsLoading(false)
          return
        }
      }

      const accessToken = data?.accessToken
      const restaurant = data?.restaurant

      if (accessToken && restaurant) {
        // Store auth data using utility function to ensure proper module-specific token storage
        setRestaurantAuthData("restaurant", accessToken, restaurant)

        // Dispatch custom event for same-tab updates
        window.dispatchEvent(new Event("restaurantAuthChanged"))

        sessionStorage.removeItem("restaurantAuthData")

        setTimeout(async () => {
          // After signup, send to onboarding
          if (authData?.isSignUp) {
            navigate("/restaurant/onboarding", { replace: true })
          } else {
            // After login, check if onboarding is incomplete
            try {
              const incompleteStep = await checkOnboardingStatus()
              if (incompleteStep) {
                // Navigate to onboarding with the incomplete step
                navigate(`/restaurant/onboarding?step=${incompleteStep}`, { replace: true })
              } else {
                // Onboarding is complete, go to restaurant home
                navigate("/restaurant", { replace: true })
              }
            } catch (err) {
              console.error("Failed to check onboarding status:", err)
              // Fallback to restaurant home
              navigate("/restaurant", { replace: true })
            }
          }
        }, 500)
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Invalid OTP. Please try again."
      setError(message)
      setOtp(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please go back and try again.")
      }

      const purpose = authData.isSignUp ? "register" : "login"
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null

      await restaurantAPI.sendOTP(phone, purpose, email)
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to resend OTP. Please try again."
      setError(message)
    }

    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    setIsLoading(false)
    setOtp(["", "", "", "", "", ""])
    inputRefs.current[0]?.focus()
  }

  const isOtpComplete = otp.every((digit) => digit !== "")

  if (!authData) {
    return null
  }

  return (
    <div className="max-h-screen h-screen bg-white flex flex-col">
      {/* Header with Back Button and Title */}
      <div className="relative flex items-center justify-center py-4 px-4">
        <button
          onClick={() => navigate("/restaurant/login")}
          className="absolute left-4 top-1/2 -translate-y-1/2"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-black" />
        </button>
        <h2 className="text-lg font-bold text-black">Verify details</h2>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col px-6 overflow-y-auto">
        <div className="w-full max-w-md mx-auto space-y-8 py-8">
          {/* Instruction Text */}
          <div className="text-center">
            <p className="text-base text-gray-900 leading-relaxed">
              Enter OTP sent on <span className="font-semibold">{contactInfo}</span>. Do not share OTP with anyone.
            </p>
          </div>

          {/* OTP Input Fields - Horizontal Lines */}
          <div className="flex justify-center gap-4">
            {otp.map((digit, index) => {
              const hasValue = digit !== ""
              const isFocused = focusedIndex === index

              return (
                <div key={index} className="relative flex flex-col items-center min-w-[48px] py-2" style={{ minHeight: '60px' }}>
                  {/* Clickable Input Area - Large clickable zone */}
                  <input
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit || ""}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    onFocus={() => setFocusedIndex(index)}
                    onBlur={() => setFocusedIndex(null)}
                    disabled={isLoading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-text z-20"
                    style={{ minHeight: '60px' }}
                    aria-label={`OTP digit ${index + 1}`}
                  />
                  {/* Digit Display Above Line */}
                  {hasValue && (
                    <div className="absolute top-0 text-2xl font-semibold text-gray-900 pointer-events-none z-10">
                      {digit}
                    </div>
                  )}
                  {/* Visual Line Indicator */}
                  <div className="w-12 relative mt-8">
                    {hasValue ? (
                      <div className="absolute inset-0 bg-blue-600 h-0.5" />
                    ) : isFocused ? (
                      <div className="absolute inset-0 bg-blue-600 h-0.5" />
                    ) : (
                      <div className="absolute inset-0 h-0.5 border-b border-dashed border-gray-400" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Resend OTP Timer */}
          <div className="text-center">
            {resendTimer > 0 ? (
              <p className="text-sm text-gray-900">
                Resend OTP in <span className="font-semibold">{resendTimer} secs</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={isLoading}
                className="text-sm text-blue-600 hover:underline font-medium disabled:opacity-50"
              >
                Resend OTP
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section - Continue Button */}
      <div className="px-6 pb-8 pt-4">
        <div className="w-full max-w-md mx-auto">
          <Button
            onClick={() => handleVerify()}
            disabled={isLoading || !isOtpComplete}
            className={`w-full h-12 rounded-lg font-bold text-base transition-colors ${!isLoading && isOtpComplete
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
          >
            {isLoading ? "Verifying..." : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  )
}
