import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Input } from "@food/components/ui/input"
import { Button } from "@food/components/ui/button"
import { authAPI, userAPI } from "@food/api"
import { setAuthData as setUserAuthData } from "@food/utils/auth"

const OTP_LENGTH = 4
const BRAND_GREEN = "#2A9C64"

export default function OTP() {
  const navigate = useNavigate()
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill("")) // exactly 4 digits
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [showNameInput, setShowNameInput] = useState(false)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [verifiedOtp, setVerifiedOtp] = useState("")
  const [pendingSession, setPendingSession] = useState(null)
  const [contactInfo, setContactInfo] = useState("")
  const [contactType, setContactType] = useState("phone")
  const [deviceToken, setDeviceToken] = useState(null)
  const [activePlatform, setActivePlatform] = useState("web")
  const inputRefs = useRef([])
  const submittingRef = useRef(false)

  useEffect(() => {
    // Redirect to home if already authenticated
    const isAuthenticated = localStorage.getItem("user_authenticated") === "true"
    if (isAuthenticated) {
      navigate("/user", { replace: true })
      return
    }

    // Get auth data from sessionStorage
    const stored = sessionStorage.getItem("userAuthData")
    if (!stored) {
      // No auth data, redirect to sign in
      navigate("/user/auth/login", { replace: true })
      return
    }
    const data = JSON.parse(stored)
    setAuthData(data)

    // Handle both phone and email
    if (data.method === "email" && data.email) {
      setContactType("email")
      setContactInfo(data.email)
    } else if (data.phone) {
      setContactType("phone")
      // Extract and format phone number for display
      const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
      if (phoneMatch) {
        const formattedPhone = `${phoneMatch[1]}-${phoneMatch[2].replace(/\D/g, "")}`
        setContactInfo(formattedPhone)
      } else {
        setContactInfo(data.phone || "")
      }

      // OTP auto-fill removed - user must manually enter OTP
    }

    // Start resend timer
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
    // Focus first input on mount
    if (inputRefs.current[0] && !showNameInput) {
      inputRefs.current[0].focus()
    }
  }, [showNameInput])

  const handleChange = (index, value) => {
    // Only allow digits; OTP is exactly 4 digits
    if (value && !/^\d$/.test(value)) {
      return
    }

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    // Auto-focus next input (4 boxes only)
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    if (!showNameInput && newOtp.slice(0, OTP_LENGTH).every((digit) => digit !== "")) {
      handleVerify(newOtp.slice(0, OTP_LENGTH).join(""))
    }
  }

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === "Backspace") {
      if (otp[index]) {
        // If current input has value, clear it
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        // If current input is empty, move to previous and clear it
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
    // Handle paste (4 digits only)
    if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      navigator.clipboard.readText().then((text) => {
        const digits = text.replace(/\D/g, "").slice(0, OTP_LENGTH).split("")
        const newOtp = [...otp]
        digits.forEach((digit, i) => {
          if (i < OTP_LENGTH) newOtp[i] = digit
        })
        setOtp(newOtp)
        if (!showNameInput && digits.length === OTP_LENGTH) {
          handleVerify(newOtp.slice(0, OTP_LENGTH).join(""))
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
    digits.forEach((digit, i) => {
      if (i < OTP_LENGTH) newOtp[i] = digit
    })
    setOtp(newOtp)
    if (!showNameInput && digits.length === OTP_LENGTH) {
      handleVerify(newOtp.slice(0, OTP_LENGTH).join(""))
    } else {
      inputRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus()
    }
  }

  const handleVerify = async (otpValue = null) => {
    if (showNameInput) return
    if (submittingRef.current) return

    const code = (otpValue || otp.join("")).replace(/\D/g, "")
    const code4 = code.slice(0, OTP_LENGTH)
    if (code4.length !== OTP_LENGTH) {
      setError("OTP must be exactly 4 digits")
      return
    }

    submittingRef.current = true
    setIsLoading(true)
    setError("")

    try {
      const phone = authData?.method === "phone" ? authData.phone : null
      const email = authData?.method === "email" ? authData.email : null
      const purpose = authData?.isSignUp ? "register" : "login"
      const providedName = authData?.isSignUp ? authData?.name || null : null
      const referralCode = authData?.referralCode || null

      // Try to get FCM token before verifying OTP
      let fcmToken = null;
      let platform = "web";
      try {
        if (typeof window !== "undefined") {
          if (window.flutter_inappwebview) {
            platform = "mobile";
            const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"];
            for (const handlerName of handlerNames) {
              try {
                const t = await window.flutter_inappwebview.callHandler(handlerName, { module: "user" });
                if (t && typeof t === "string" && t.length > 20) {
                  fcmToken = t.trim();
                  break;
                }
              } catch (e) {}
            }
          } else {
            fcmToken = localStorage.getItem("fcm_web_registered_token_user") || null;
          }
        }
      } catch (e) {
        console.warn("Failed to get FCM token during login", e);
      }

      setDeviceToken(fcmToken);
      setActivePlatform(platform);

      const response = await authAPI.verifyOTP(
        phone,
        code4,
        purpose,
        providedName,
        email,
        "user",
        null,
        referralCode,
        fcmToken,
        platform
      )
      const data = response?.data?.data || response?.data || {}

      const accessToken = data.accessToken
      const refreshToken = data.refreshToken ?? null
      const user = data.user

      if (!accessToken || !user) {
        throw new Error("Invalid response from server")
      }
      if (!refreshToken) {
        throw new Error("Invalid response from server: missing refresh token")
      }

      // Check if user needs name prompt (isNewUser flag or missing name)
      const hasName = user.name && String(user.name).trim().length > 0 && String(user.name).toLowerCase() !== "null";
      const needsName = data.isNewUser === true || !hasName;

      if (needsName) {
        setVerifiedOtp(code4)
        setPendingSession({
          accessToken,
          refreshToken,
          user,
        })
        setShowNameInput(true)
        setIsLoading(false)
        submittingRef.current = false
        return
      }

      // Clear auth data from sessionStorage
      sessionStorage.removeItem("userAuthData")

      setUserAuthData("user", accessToken, user, refreshToken)

      // Dispatch custom event for same-tab updates
      window.dispatchEvent(new Event("userAuthChanged"))

      setSuccess(true)

      // Redirect to user home after short delay
      setTimeout(() => {
        navigate("/user")
      }, 500)
    } catch (err) {
      const status = err?.response?.status
      let message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to verify OTP. Please try again."

      if (/name is required for first-time signup/i.test(String(message))) {
        setVerifiedOtp(code4)
        setShowNameInput(true)
        setError("")
        setIsLoading(false)
        submittingRef.current = false
        return
      }

      if (status === 401) {
        // Friendlier copy for deactivated users or auth errors
        if (/deactivat(ed|e)/i.test(String(message))) {
          message = "Your account is deactivated. Please contact support."
        } else {
          message = "Invalid or expired code, or account not active."
        }
      }
      setError(message)
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }

  const handleSubmitName = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError("Name is required")
      return
    }

    if (trimmedName.length < 2) {
      setNameError("Name must be at least 2 characters")
      return
    }

    if (!verifiedOtp) {
      setError("OTP verification step missing. Please request a new OTP.")
      return
    }

    setIsLoading(true)
    setError("")
    setNameError("")

    try {
      if (pendingSession?.accessToken && pendingSession?.refreshToken && pendingSession?.user) {
        setUserAuthData(
          "user",
          pendingSession.accessToken,
          {
            ...pendingSession.user,
            name: trimmedName,
          },
          pendingSession.refreshToken
        )

        const profileResponse = await userAPI.updateProfile({ name: trimmedName })
        const updatedUser =
          profileResponse?.data?.data?.user ||
          profileResponse?.data?.user ||
          profileResponse?.data?.data ||
          {
            ...pendingSession.user,
            name: trimmedName,
          }

        sessionStorage.removeItem("userAuthData")
        setUserAuthData("user", pendingSession.accessToken, updatedUser, pendingSession.refreshToken)
        window.dispatchEvent(new Event("userAuthChanged"))
        setSuccess(true)

        setTimeout(() => {
          navigate("/user")
        }, 500)
        return
      }

      const phone = authData?.method === "phone" ? authData.phone : null
      const email = authData?.method === "email" ? authData.email : null
      const purpose = authData?.isSignUp ? "register" : "login"
      const referralCode = authData?.referralCode || null

      const response = await authAPI.verifyOTP(
        phone,
        verifiedOtp,
        purpose,
        trimmedName,
        email,
        "user",
        null,
        referralCode,
        deviceToken,
        activePlatform
      )
      const data = response?.data?.data || response?.data || {}

      const accessToken = data.accessToken
      const refreshToken = data.refreshToken ?? null
      const user = data.user

      if (!accessToken || !user) {
        throw new Error("Invalid response from server")
      }
      if (!refreshToken) {
        throw new Error("Invalid response from server: missing refresh token")
      }

      sessionStorage.removeItem("userAuthData")

      setUserAuthData("user", accessToken, user, refreshToken)

      window.dispatchEvent(new Event("userAuthChanged"))

      setSuccess(true)

      setTimeout(() => {
        navigate("/user")
      }, 500)
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to complete registration. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0 || isLoading) return

    setIsLoading(true)
    setError("")

    try {
      const phone = authData?.method === "phone" ? authData.phone : null
      const email = authData?.method === "email" ? authData.email : null
      const purpose = authData?.isSignUp ? "register" : "login"

      // Call backend to resend OTP
      await authAPI.sendOTP(phone, purpose, email)
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to resend OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }

    // Reset timer
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

    setOtp(Array(OTP_LENGTH).fill(""))
    setShowNameInput(false)
    setName("")
    setNameError("")
    setVerifiedOtp("")
    setPendingSession(null)
    inputRefs.current[0]?.focus()
  }

  if (!authData) {
    return null
  }

  return (
    <AnimatedPage className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[390px] flex-col bg-white">
        <div className="flex items-center border-b border-[#e9e9e9] px-5 py-5">
          <button
            onClick={() => navigate("/user/auth/login")}
            className="p-1"
            aria-label="Go back"
          >
            <ArrowLeft className="h-6 w-6 text-black" />
          </button>
          <span className="flex-1 pr-7 text-center text-[1.85rem] font-bold tracking-[-0.03em] text-black">
            {showNameInput ? "Welcome!" : "OTP Verification"}
          </span>
          <span className="w-7 shrink-0" aria-hidden="true" />
        </div>

        <div className="flex flex-1 flex-col px-7 pt-10 pb-8">
          <div className="text-center">
            <div className="space-y-3">
              <h2 className="text-[1.05rem] font-medium leading-7 text-black">
                {showNameInput 
                  ? "Help us know you better" 
                  : contactType === "email"
                    ? "Verify your email"
                    : "We have sent a verification code to"}
              </h2>
              <p className="text-[1.05rem] font-semibold text-black">
                {showNameInput
                  ? "Please enter your full name to continue."
                  : contactInfo}
              </p>
            </div>
          </div>

          {!showNameInput && (
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
          )}

          {showNameInput && (
            <div className="mt-14 space-y-6">
              <div className="space-y-2">
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (nameError) setNameError("")
                  }}
                  disabled={isLoading}
                  placeholder="Full Name"
                  className={`h-14 rounded-2xl border text-lg text-black placeholder:text-[#888888] ${
                    nameError ? "border-red-500" : "border-[#d7d5d2]"
                  } transition-all`}
                  style={{ backgroundColor: "#ffffff", boxShadow: "none" }}
                />
                {nameError && (
                  <p className="text-xs text-red-500 pl-1">
                    {nameError}
                  </p>
                )}
              </div>

              <Button
                onClick={handleSubmitName}
                disabled={isLoading}
                className="h-14 w-full rounded-2xl text-lg font-bold text-white transition-all active:scale-[0.98]"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                {isLoading ? "Getting things ready..." : "Finish Registration"}
              </Button>
            </div>
          )}

          {isLoading && !showNameInput && (
            <div className="mt-6 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND_GREEN }} />
            </div>
          )}

          <div className="mt-auto pt-10 text-center">
            <button
              type="button"
              onClick={() => navigate("/user/auth/login")}
              className="text-[1.05rem] font-medium"
              style={{ color: BRAND_GREEN }}
            >
              Go back to login methods
            </button>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}

