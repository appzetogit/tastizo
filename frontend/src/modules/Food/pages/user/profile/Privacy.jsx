import { Link, useNavigate, useLocation } from "react-router-dom"
import { useState, useEffect } from "react"
import { ArrowLeft, Lock, Loader2 } from "lucide-react"
import { motion } from "framer-motion"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import api from "@food/api"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { API_ENDPOINTS } from "@food/api/config"

const DEFAULT_PRIVACY_POLICY = `
<h2><strong>1. Introduction</strong></h2>
<p>Tastizo ("we", "our", "us") is committed to protecting and respecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and mobile application (collectively, the "Platform").</p>

<h2><strong>2. Information We Collect</strong></h2>
<p>We may collect the following types of information:</p>
<ul>
  <li><strong>Personal Information:</strong> Name, email address, phone number, delivery address, date of birth, and gender when you create an account or place an order.</li>
  <li><strong>Payment Information:</strong> Payment method details are processed securely through our payment gateway partners (e.g., Razorpay). We do not store your full card details on our servers.</li>
  <li><strong>Location Data:</strong> Real-time location data to provide accurate delivery services and show nearby restaurants.</li>
  <li><strong>Device Information:</strong> Device type, operating system, unique device identifiers, and mobile network information.</li>
  <li><strong>Usage Data:</strong> Pages visited, features used, search queries, order history, and interaction patterns.</li>
</ul>

<h2><strong>3. How We Use Your Information</strong></h2>
<ul>
  <li>To process and deliver your food orders.</li>
  <li>To communicate order updates, promotions, and customer support.</li>
  <li>To improve our Platform, services, and user experience.</li>
  <li>To detect and prevent fraud and ensure platform security.</li>
  <li>To comply with legal obligations.</li>
</ul>

<h2><strong>4. Information Sharing</strong></h2>
<p>We may share your information with:</p>
<ul>
  <li><strong>Restaurant Partners:</strong> To fulfill your orders.</li>
  <li><strong>Delivery Partners:</strong> To deliver your orders to your specified address.</li>
  <li><strong>Payment Processors:</strong> To process payments securely.</li>
  <li><strong>Service Providers:</strong> Third-party vendors who assist with analytics, notifications, and customer support.</li>
</ul>
<p>We do not sell your personal information to third parties.</p>

<h2><strong>5. Data Security</strong></h2>
<p>We implement industry-standard security measures including encryption, secure servers, and access controls to protect your personal information.</p>

<h2><strong>6. Your Rights</strong></h2>
<p>You have the right to access, correct, or delete your personal data. You may also request data portability or restrict processing. To exercise these rights, contact us at <strong>support@tastizo.com</strong>.</p>

<h2><strong>7. Data Retention</strong></h2>
<p>We retain your data for as long as your account is active or as needed to provide services. You may request deletion of your account and data at any time.</p>

<h2><strong>8. Contact Us</strong></h2>
<p>If you have questions about this Privacy Policy, please contact us at <strong>support@tastizo.com</strong>.</p>
`;

export default function Privacy() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [privacyData, setPrivacyData] = useState({
    title: 'Privacy Policy',
    content: ''
  })

  useEffect(() => {
    fetchPrivacyData()
  }, [])

  const fetchPrivacyData = async () => {
    try {
      setLoading(true)
      const response = await api.get(API_ENDPOINTS.ADMIN.PRIVACY_PUBLIC)
      if (response.data.success) {
        setPrivacyData(response.data.data || { title: 'Privacy Policy', content: '' })
      }
    } catch (error) {
      console.error('Error fetching privacy data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (location.state?.from) {
      navigate(location.state.from)
    } else if (window.history.length > 2) {
      goBack()
    } else {
      navigate('/food/user')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#CB202D]" />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-white dark:bg-[#0a0a0a] pb-10">
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
               {privacyData.title || "Privacy Policy"}
             </h1>
             <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Tastizo Policy</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[#111] rounded-[2rem] p-6 md:p-10 shadow-sm border border-gray-50 dark:border-gray-900"
        >
          {privacyData.content ? (
            <div
              className="prose prose-slate dark:prose-invert max-w-none
                prose-headings:font-black prose-headings:text-gray-900 dark:prose-headings:text-white
                prose-p:text-gray-600 dark:prose-p:text-gray-400 prose-p:leading-relaxed
                prose-strong:text-gray-900 dark:prose-strong:text-white
                prose-a:text-[#CB202D] dark:prose-a:text-[#2A9C64]
                prose-li:text-gray-600 dark:prose-li:text-gray-400"
              dangerouslySetInnerHTML={{ __html: privacyData.content || DEFAULT_PRIVACY_POLICY }}
            />
          ) : (
            <div className="text-center py-20">
               <Lock className="w-16 h-16 text-gray-100 dark:text-gray-800 mx-auto mb-4" />
               <p className="text-gray-400 font-medium">No content available at the moment.</p>
            </div>
          )}
        </motion.div>

        <p className="text-center mt-10 text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] leading-relaxed">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} <br />
          Â© {new Date().getFullYear()} Tastizo. All Rights Reserved.
        </p>
      </div>
    </AnimatedPage>
  )
}



