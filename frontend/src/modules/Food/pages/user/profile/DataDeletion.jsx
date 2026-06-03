import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Trash2, ShieldAlert, CheckCircle2, User, Mail, Phone, FileText } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"

export default function DataDeletion() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    role: "customer",
    reason: ""
  })
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState("")

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    if (error) setError("")
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      setError("Please fill in all required fields.")
      return
    }

    setIsSubmitting(true)
    
    // Simulate API request to backend support/ticket
    try {
      await new Promise(resolve => setTimeout(resolve, 1500))
      setIsSubmitted(true)
    } catch (err) {
      setError("Something went wrong. Please try again later.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBack = () => {
    if (window.history.length > 2) {
      goBack()
    } else {
      navigate('/food/user')
    }
  }

  return (
    <AnimatedPage className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] pb-16">
      {/* Premium Sticky Header */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-900">
        <div className="max-w-4xl mx-auto px-4 h-16 md:h-20 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            className="h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition-all active:scale-95"
          >
            <ArrowLeft className="h-6 w-6 text-gray-900 dark:text-white" />
          </Button>
          <div className="flex-1">
             <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
               Data Deletion Request
             </h1>
             <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Tastizo Privacy</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Side: General Info & Instructions */}
        <div className="md:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-[#111] rounded-[2rem] p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-900 space-y-6"
          >
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="w-6 h-6 text-[#2A9C64]" />
                Tastizo Data Deletion Policy
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
                At Tastizo, we respect your privacy and give you full control over your personal data. You can request the deletion of your account and all associated personal information at any time.
              </p>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-900 pt-6 space-y-4">
              <h3 className="font-bold text-gray-900 dark:text-white text-base">How to delete your account (In-App)</h3>
              
              <div className="grid grid-cols-1 gap-4 text-sm">
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
                  <p className="font-semibold text-gray-900 dark:text-white mb-1">For Customers</p>
                  <p className="text-gray-600 dark:text-gray-400 text-xs">
                    Log into the Tastizo mobile app, go to your <b>Profile</b>, tap <b>Edit Profile</b>, and choose the <b>Delete Account</b> option at the bottom.
                  </p>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
                  <p className="font-semibold text-[#2A9C64] mb-1">For Restaurant Partners</p>
                  <p className="text-gray-600 dark:text-gray-400 text-xs">
                    Log into the Tastizo Restaurant dashboard, navigate to <b>Explore More</b>, and tap the <b>Delete Account</b> button at the bottom of the page.
                  </p>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
                  <p className="font-semibold text-orange-600 mb-1">For Delivery Partners</p>
                  <p className="text-gray-600 dark:text-gray-400 text-xs">
                    Log into the Tastizo Delivery app, navigate to <b>Settings</b>, and tap <b>Delete Account</b>, or submit a request directly through your app's support tab.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-900 pt-6 space-y-4">
              <h3 className="font-bold text-gray-900 dark:text-white text-base">Data Retention & Deletion details</h3>
              <ul className="list-disc list-inside space-y-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <li><b>Data Deleted:</b> Your profile data (name, email, phone number, profile image), address entries, payment tokens, and device identifiers are immediately removed.</li>
                <li><b>Data Retained:</b> Transactional records, tax invoices, and accounting history will be retained for up to 7 years in accordance with legal and financial compliance requirements under Indian tax regulations.</li>
                <li><b>Processing Time:</b> Account deletion requests are typically processed within 24 to 48 hours of submission.</li>
              </ul>
            </div>
          </motion.div>
        </div>

        {/* Right Side: Request Form */}
        <div className="md:col-span-1">
          <AnimatePresence mode="wait">
            {!isSubmitted ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white dark:bg-[#111] rounded-[2rem] p-6 shadow-sm border border-gray-100 dark:border-gray-900 space-y-4 sticky top-24"
              >
                <div className="text-center">
                  <Trash2 className="w-10 h-10 text-red-500 mx-auto mb-2" />
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">Web Deletion Form</h3>
                  <p className="text-xs text-gray-500 mt-1">Can't log into the app? Request deletion manually below</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 text-xs rounded-xl border border-red-100 dark:border-red-950/50">
                      {error}
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">Full Name *</label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => handleInputChange("name", e.target.value)}
                        placeholder="John Doe"
                        className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 pl-10 focus:outline-none focus:ring-1 focus:ring-[#2A9C64]"
                      />
                      <User className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">Email Address *</label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                        placeholder="john@example.com"
                        className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 pl-10 focus:outline-none focus:ring-1 focus:ring-[#2A9C64]"
                      />
                      <Mail className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">Phone Number *</label>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={(e) => handleInputChange("phone", e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 pl-10 focus:outline-none focus:ring-1 focus:ring-[#2A9C64]"
                      />
                      <Phone className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">Account Role *</label>
                    <select
                      value={formData.role}
                      onChange={(e) => handleInputChange("role", e.target.value)}
                      className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#2A9C64]"
                    >
                      <option value="customer">Customer / User</option>
                      <option value="restaurant">Restaurant Owner</option>
                      <option value="delivery">Delivery Partner</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">Reason for Deletion (Optional)</label>
                    <div className="relative">
                      <textarea
                        value={formData.reason}
                        onChange={(e) => handleInputChange("reason", e.target.value)}
                        placeholder="I no longer need my account..."
                        rows={3}
                        className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 pl-10 focus:outline-none focus:ring-1 focus:ring-[#2A9C64]"
                      />
                      <FileText className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-[#2A9C64] hover:bg-[#207a4e] text-white py-3.5 font-bold rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Deletion Request"}
                  </Button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white dark:bg-[#111] rounded-[2rem] p-8 shadow-sm border border-gray-100 dark:border-gray-900 text-center space-y-4"
              >
                <CheckCircle2 className="w-16 h-16 text-[#2A9C64] mx-auto animate-bounce" />
                <h3 className="font-bold text-gray-900 dark:text-white text-lg">Request Received!</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  We have received your manual data deletion request for the email <b>{formData.email}</b>. Our support team will process and complete the deletion process within 24 to 48 hours.
                </p>
                <Button
                  onClick={() => setIsSubmitted(false)}
                  variant="outline"
                  className="w-full mt-4"
                >
                  Submit Another Request
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AnimatedPage>
  )
}
