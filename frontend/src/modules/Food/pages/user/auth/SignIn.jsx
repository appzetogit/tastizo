import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { useNavigate, Link, useSearchParams } from "react-router-dom"
import { AlertCircle, ChevronDown, Loader2, Check } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { authAPI } from "@food/api"
import logoNew from "@food/assets/logo.png"

const REMEMBER_LOGIN_KEY = "user_login_phone"
const TASTIZO_BG = "#2a9c64"
const headingWords = ["India's", "#1", "Food", "Delivery", "and", "Dining", "App"]

export default function SignIn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
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

    const stored = sessionStorage.getItem("userAuthData")
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
    const phoneError = validatePhone(formData.phone)
    setPhoneError(phoneError)
    if (phoneError) return
    if (submittingRef.current) return

    submittingRef.current = true
    setIsLoading(true)
    setPhoneError("")

    try {
      const countryCode = formData.countryCode?.trim() || "+91"
      const phoneDigits = String(formData.phone ?? "").replace(/\D/g, "").slice(0, 10)
      const fullPhone = `${countryCode} ${phoneDigits}`

      await authAPI.sendOTP(fullPhone, "login", null)

      if (rememberLogin) {
        localStorage.setItem(REMEMBER_LOGIN_KEY, phoneDigits)
      } else {
        localStorage.removeItem(REMEMBER_LOGIN_KEY)
      }

      const ref = String(searchParams.get("ref") || "").trim()
      const authData = {
        method: "phone",
        phone: fullPhone,
        email: null,
        name: null,
        referralCode: ref || null,
        isSignUp: false,
        module: "user",
      }

      sessionStorage.setItem("userAuthData", JSON.stringify(authData))
      navigate("/user/auth/otp")
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        apiError?.response?.data?.error ||
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
      style={{ backgroundColor: TASTIZO_BG }}
    >
      <div className="mx-auto flex min-h-screen w-full sm:max-w-[400px] flex-col overflow-hidden">
        <div className="flex flex-1 flex-col bg-white">
          <div>
            <div
              className="flex min-h-[360px] w-full items-center justify-center rounded-b-[2rem] pt-6 pb-10"
              style={{ backgroundColor: TASTIZO_BG }}
            >
              <img
                src={logoNew}
                alt="Tastizo"
                className="h-48 w-auto object-contain sm:h-56"
              />
            </div>

            <div className="bg-white pt-10 pb-4">
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
                  className="text-[1.6rem] sm:text-[1.8rem] font-semibold leading-[1.18] tracking-[-0.03em] text-black"
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
                    className={`h-14 flex-1 rounded-2xl border bg-white px-4 text-lg text-[#7d4f1c] placeholder:text-[#9f6d37] focus-visible:ring-0 focus-visible:border-[#8a2323] ${
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
                      rememberLogin ? "bg-[#2a9c64] text-white" : "border border-[#cfc7bf] bg-white text-transparent"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span>Remember my login for faster sign-in</span>
                </label>

                <Button
                  type="submit"
                  className="mt-2 h-14 w-full rounded-2xl bg-[#2a9c64] text-lg font-bold text-white transition-all hover:bg-[#238653] active:scale-[0.99]"
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

          <div className="mt-auto bg-white px-4 pt-4 pb-3 sm:px-5">
            <div className="text-center text-[0.78rem] leading-5 text-[#67635f]">
              <p>By continuing, you agree to our</p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                <Link to="/profile/terms" className="underline underline-offset-2 hover:text-black transition-colors">
                  Terms of Service
                </Link>
                <span>•</span>
                <Link to="/profile/privacy" className="underline underline-offset-2 hover:text-black transition-colors">
                  Privacy Policy
                </Link>
                <span>•</span>
                <Link to="/profile/refund" className="underline underline-offset-2 hover:text-black transition-colors">
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
