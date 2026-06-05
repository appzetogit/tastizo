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
      className="min-h-screen flex items-center justify-center overflow-x-hidden md:bg-[#f6f9f7] bg-[#2a9c64]"
    >
      {/* Desktop Split View (Shown on screens md and up) */}
      <div className="hidden md:flex w-full min-h-screen bg-white">
        {/* Left Side: Brand Splash Panel */}
        <div
          className="w-1/2 flex flex-col items-center justify-center p-12 relative overflow-hidden"
          style={{ backgroundColor: TASTIZO_BG }}
        >
          {/* Decorative glowing gradient elements */}
          <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-white/5 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-white/5 blur-3xl pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            className="flex flex-col items-center justify-center z-10"
          >
            <img
              src={logoNew}
              alt="Tastizo"
              className="h-64 lg:h-80 w-auto object-contain"
            />
          </motion.div>
        </div>

        {/* Right Side: Centered login card */}
        <div className="w-1/2 flex flex-col justify-center px-12 lg:px-24 relative bg-white border-l border-gray-100">
          <div className="w-full max-w-[480px] mx-auto flex flex-col min-h-[85vh]">
            <div className="my-auto py-10">
              <div className="mb-10">
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
                  className="text-[2.8rem] lg:text-[3.2rem] font-extrabold leading-[1.15] tracking-[-0.04em] text-black text-center flex flex-col items-center justify-center font-['Outfit']"
                >
                  <div className="flex flex-wrap justify-center">
                    {["India's", "#1", "Food", "Delivery", "and", "Dining"].map((word) => (
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
                  </div>
                  <div className="flex justify-center mt-1">
                    {["App"].map((word) => (
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
                        className="inline-block"
                      >
                        {word}
                      </motion.span>
                    ))}
                  </div>
                </motion.h1>
                <p className="text-gray-500 text-base lg:text-lg font-semibold text-center mt-4">
                  Log in or sign up
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex items-stretch gap-4">
                  <button
                    type="button"
                    className="flex w-[115px] shrink-0 items-center justify-between rounded-2xl border border-[#d7d5d2] bg-white px-4 text-[1.1rem] font-semibold text-[#221f1b]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-bold">IN</span>
                      <span className="text-gray-500 font-semibold">+91</span>
                    </span>
                    <ChevronDown className="h-4 w-4 text-[#8a847d]" />
                  </button>

                  <Input
                    id="phone-desktop"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    placeholder="Enter 10-digit Phone Number"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`h-16 flex-1 rounded-2xl border bg-white px-5 text-xl text-black placeholder:text-gray-400 focus-visible:ring-0 focus-visible:border-[#2a9c64] ${phoneError ? "border-red-400" : "border-[#d7d5d2]"
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

                <label className="flex cursor-pointer items-center gap-3.5 pt-1.5 text-[1.05rem] font-medium text-[#3e3a36]">
                  <input
                    type="checkbox"
                    checked={rememberLogin}
                    onChange={(e) => setRememberLogin(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${rememberLogin ? "bg-[#2a9c64] text-white" : "border border-[#cfc7bf] bg-white text-transparent"
                      }`}
                  >
                    <Check className="h-4 w-4" />
                  </span>
                  <span>Remember my login for faster sign-in</span>
                </label>

                <Button
                  type="submit"
                  className="mt-6 h-16 w-full rounded-2xl bg-[#2a9c64] text-xl font-bold text-white transition-all hover:bg-[#238653] active:scale-[0.99]"
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

            {/* Footer */}
            <div className="mt-auto pt-4 pb-6">
              <div className="text-center text-[0.78rem] leading-5 text-[#67635f]">
                <p>By continuing, you agree to our</p>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                  <Link to="/profile/terms" state={{ from: "/user/auth/login" }} className="underline underline-offset-2 hover:text-black transition-colors">
                    Terms of Service
                  </Link>
                  <span>•</span>
                  <Link to="/profile/privacy" state={{ from: "/user/auth/login" }} className="underline underline-offset-2 hover:text-black transition-colors">
                    Privacy Policy
                  </Link>
                  <span>•</span>
                  <Link to="/profile/refund" state={{ from: "/user/auth/login" }} className="underline underline-offset-2 hover:text-black transition-colors">
                    Content Policy
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile View Layout (Exactly original structure, preserving phone UI) */}
      <div className="md:hidden mx-auto flex min-h-screen w-full sm:max-w-[400px] flex-col overflow-hidden">
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
                  className="text-[1.8rem] sm:text-[2rem] font-bold leading-[1.2] tracking-[-0.03em] text-black font-['Outfit'] text-center flex flex-col items-center justify-center"
                >
                  <div className="flex flex-wrap justify-center">
                    {["India's", "#1", "Food", "Delivery", "and", "Dining"].map((word) => (
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
                        className="mr-[0.25em] inline-block last:mr-0"
                      >
                        {word}
                      </motion.span>
                    ))}
                  </div>
                  <div className="flex justify-center mt-1">
                    {["App"].map((word) => (
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
                        className="inline-block"
                      >
                        {word}
                      </motion.span>
                    ))}
                  </div>
                </motion.h1>
                <p className="text-gray-500 text-sm font-semibold text-center mt-3">
                  Log in or sign up
                </p>
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
                    placeholder="Enter 10-digit Phone Number"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`h-14 flex-1 rounded-2xl border bg-white px-4 text-lg text-black placeholder:text-gray-400 focus-visible:ring-0 focus-visible:border-[#2a9c64] ${phoneError ? "border-red-400" : "border-[#d7d5d2]"
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
                    className={`flex h-5 w-5 items-center justify-center rounded-md transition-colors ${rememberLogin ? "bg-[#2a9c64] text-white" : "border border-[#cfc7bf] bg-white text-transparent"
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
                <Link to="/profile/terms" state={{ from: "/user/auth/login" }} className="underline underline-offset-2 hover:text-black transition-colors">
                  Terms of Service
                </Link>
                <span>•</span>
                <Link to="/profile/privacy" state={{ from: "/user/auth/login" }} className="underline underline-offset-2 hover:text-black transition-colors">
                  Privacy Policy
                </Link>
                <span>•</span>
                <Link to="/profile/refund" state={{ from: "/user/auth/login" }} className="underline underline-offset-2 hover:text-black transition-colors">
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
