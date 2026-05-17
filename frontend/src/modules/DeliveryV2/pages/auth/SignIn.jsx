import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { useNavigate, Link, useLocation } from "react-router-dom"
import { AlertCircle, ChevronDown, Loader2, Check } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { toast } from "sonner"
import { deliveryAPI } from "@food/api"
import { clearModuleAuth } from "@food/utils/auth"
import deliveryImage from "@/assets/delivery.jpeg"

const REMEMBER_LOGIN_KEY = "delivery_login_phone"
const DEFAULT_COUNTRY_CODE = "+91"
const headingWords = ["India's", "#1", "Delivery", "Partner", "and", "Rider", "App"]

export default function DeliverySignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const [formData, setFormData] = useState({
    phone: "",
    countryCode: DEFAULT_COUNTRY_CODE,
  })
  const [rememberLogin, setRememberLogin] = useState(true)
  const [phoneError, setPhoneError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    const storedPhone = localStorage.getItem(REMEMBER_LOGIN_KEY) || ""
    if (storedPhone) {
      setFormData((prev) => ({ ...prev, phone: storedPhone }))
      setRememberLogin(true)
      return
    }

    const stored = sessionStorage.getItem("deliveryAuthData")
    if (!stored) return

    try {
      const data = JSON.parse(stored)
      const fullPhone = String(data.phone || "").trim()
      const phoneDigits = fullPhone.replace(/^\+91\s*/, "").replace(/\D/g, "").slice(0, 10)
      setFormData((prev) => ({
        ...prev,
        phone: phoneDigits || prev.phone,
      }))
    } catch {
      // Ignore invalid session data and keep the form empty.
    }
  }, [])

  const validatePhone = (phone) => {
    if (!phone.trim()) return "Phone number is required"
    const cleanPhone = phone.replace(/\D/g, "")
    if (!/^\d{10}$/.test(cleanPhone)) return "Phone number must be exactly 10 digits"
    if (!["6", "7", "8", "9"].includes(cleanPhone[0])) return "Please enter a valid mobile number"
    return ""
  }

  const handleChange = (e) => {
    const { name } = e.target
    let { value } = e.target

    if (name === "phone") {
      value = value.replace(/\D/g, "").slice(0, 10)
      setPhoneError(validatePhone(value))
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nextPhoneError = validatePhone(formData.phone)
    setPhoneError(nextPhoneError)
    if (nextPhoneError) return
    if (submittingRef.current) return

    submittingRef.current = true
    setIsLoading(true)
    setPhoneError("")

    try {
      const countryCode = formData.countryCode?.trim() || DEFAULT_COUNTRY_CODE
      const phoneDigits = String(formData.phone ?? "").replace(/\D/g, "").slice(0, 10)
      const fullPhone = `${countryCode} ${phoneDigits}`

      clearModuleAuth("delivery")
      await deliveryAPI.sendOTP(fullPhone, "login")

      if (rememberLogin) {
        localStorage.setItem(REMEMBER_LOGIN_KEY, phoneDigits)
      } else {
        localStorage.removeItem(REMEMBER_LOGIN_KEY)
      }

      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        purpose: "login",
        module: "delivery",
      }

      sessionStorage.setItem("deliveryAuthData", JSON.stringify(authData))
      toast.success("Verification code sent to your phone!")
      navigate("/food/delivery/otp", {
        state: { from: location.state?.from || null },
      })
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        apiError?.response?.data?.error ||
        apiError?.message ||
        "Failed to send OTP. Please try again."
      setPhoneError(message)
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <AnimatedPage
      className="min-h-screen flex items-start justify-center overflow-hidden"
      style={{ backgroundColor: "#ffffff" }}
    >
      <div className="mx-auto flex min-h-screen w-full sm:max-w-[400px] flex-col overflow-hidden">
        <div className="flex flex-1 flex-col bg-white">
          <div>
            <div
              className="flex h-[45vh] w-full items-center justify-center overflow-hidden rounded-b-[2rem] bg-white pt-4 pb-2"
            >
              <motion.img
                src={deliveryImage}
                alt="Delivery partner"
                initial={{ opacity: 0, scale: 0.88, y: 18 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  y: [0, -8, 0],
                }}
                transition={{
                  opacity: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
                  scale: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
                  y: {
                    duration: 3.2,
                    ease: "easeInOut",
                    repeat: Infinity,
                  },
                }}
                className="h-auto max-h-[194px] w-auto max-w-[63%] object-contain"
              />
            </div>

            <div className="bg-white pt-7 pb-4">
              <div className="px-4 text-center sm:px-5">
                <motion.h1
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: {},
                    visible: {
                      transition: {
                        staggerChildren: 0.06,
                        delayChildren: 0.1,
                      },
                    },
                  }}
                  className="text-[1.6rem] font-semibold leading-[1.18] tracking-[-0.03em] text-black sm:text-[1.8rem]"
                >
                  {headingWords.map((word) => (
                    <motion.span
                      key={word}
                      variants={{
                        hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
                        visible: {
                          opacity: 1,
                          y: 0,
                          filter: "blur(0px)",
                          transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
                        },
                      }}
                      className="mr-[0.3em] inline-block last:mr-0"
                    >
                      {word}
                    </motion.span>
                  ))}
                </motion.h1>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-3.5 px-4 sm:px-5">
                <div className="flex items-stretch gap-3">
                  <button
                    type="button"
                    className="flex w-[102px] shrink-0 items-center justify-between rounded-2xl border border-[#d7d5d2] bg-white px-4 text-[1rem] font-medium text-[#221f1b]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">IN</span>
                      <span className="text-[#6a6662]">+91</span>
                    </span>
                    <ChevronDown className="h-4 w-4 text-[#8a847d]" />
                  </button>

                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    placeholder="Enter Phone Number"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`h-14 flex-1 rounded-2xl border bg-white px-4 text-lg text-[#221f1b] placeholder:text-[#8a847d] focus-visible:border-[#111111] focus-visible:ring-0 ${
                      phoneError ? "border-red-400" : "border-[#d7d5d2]"
                    }`}
                    aria-invalid={phoneError ? "true" : "false"}
                  />
                </div>

                {phoneError ? (
                  <div className="flex items-center gap-1.5 pl-1 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    <span>{phoneError}</span>
                  </div>
                ) : null}

                <label className="flex cursor-pointer items-center gap-3 pt-1 text-[0.98rem] text-[#3e3a36]">
                  <input
                    type="checkbox"
                    checked={rememberLogin}
                    onChange={(e) => setRememberLogin(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md transition-colors ${
                      rememberLogin ? "bg-white text-[#111111] border border-[#111111]" : "border border-[#cfc7bf] bg-white text-transparent"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span>Remember my login for faster sign-in</span>
                </label>

                <Button
                  type="submit"
                  className="mt-2 h-14 w-full rounded-2xl border border-transparent bg-[#1E7A4A] text-lg font-bold text-white transition-all hover:bg-[#0A2B1D] active:scale-[0.99]"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </form>
            </div>
          </div>

          <div className="mt-auto bg-white px-4 pb-3 pt-4 sm:px-5">
            <div className="text-center text-[0.78rem] leading-5 text-[#67635f]">
              <p>By continuing, you agree to our</p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                <Link to="/food/delivery/terms" className="underline underline-offset-2 transition-colors hover:text-black">
                  Terms of Service
                </Link>
                <span>&bull;</span>
                <Link to="/food/delivery/privacy" className="underline underline-offset-2 transition-colors hover:text-black">
                  Privacy Policy
                </Link>
                <span>&bull;</span>
                <Link to="/food/delivery/terms" className="underline underline-offset-2 transition-colors hover:text-black">
                  Content Policy
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}
