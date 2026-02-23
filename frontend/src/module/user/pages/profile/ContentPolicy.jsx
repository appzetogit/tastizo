import { useNavigate } from "react-router-dom"
import { ArrowLeft, Shield } from "lucide-react"
import { motion } from "framer-motion"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"

export default function ContentPolicy() {
  const navigate = useNavigate()

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-[#0a0a0a] dark:to-[#1a1a1a]">
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
        <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8">
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 md:h-10 md:w-10 p-0 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft className="h-5 w-5 md:h-6 md:w-6 text-gray-900 dark:text-white" />
          </Button>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white">Content Policy</h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="p-6 md:p-8 lg:p-10"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
            <Shield className="h-6 w-6 md:h-7 md:w-7 text-green-600 dark:text-green-400" />
            Content Policy
          </h2>
          <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-white prose-ul:text-gray-700 dark:prose-ul:text-gray-300 prose-ol:text-gray-700 dark:prose-ol:text-gray-300 prose-li:text-gray-700 dark:prose-li:text-gray-300 leading-relaxed">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Our platform is committed to maintaining a safe and respectful environment. By using our services, you agree to follow our content standards.
            </p>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-2">Prohibited Content</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>Content that is illegal, harmful, threatening, abusive, harassing, or otherwise objectionable</li>
              <li>Spam, misleading information, or impersonation</li>
              <li>Content that infringes intellectual property or privacy rights</li>
              <li>Content that promotes violence, self-harm, or discrimination</li>
            </ul>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-2">Enforcement</h3>
            <p className="text-gray-700 dark:text-gray-300">
              We may remove content that violates this policy and take action against accounts that repeatedly breach these guidelines. For questions, please contact support.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-center mt-8 mb-4"
        >
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </motion.div>
      </div>
    </AnimatedPage>
  )
}
