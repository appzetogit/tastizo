import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"

/**
 * Shared modal to choose a variant (e.g. size) before adding to cart.
 * Used globally so variant selection is asked on every page, not only restaurant menu.
 */
export default function VariantPickerModal({ item, onSelectVariation, onClose }) {
  if (!item || !item.variations?.length) return null

  const content = (
    <AnimatePresence>
      <>
        <motion.div
          className="fixed inset-0 bg-black/40 z-[9999]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <motion.div
          className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-[10000] bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[70vh] md:max-w-md w-full flex flex-col"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: 0.2, type: "spring", damping: 30, stiffness: 400 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-10">
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
          <div className="p-4 pt-8 pb-6 overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              {item.name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose an option</p>
            <div className="space-y-2">
              {item.variations.map((variation) => (
                <button
                  key={variation.id}
                  type="button"
                  onClick={(e) => onSelectVariation(variation, e)}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-green-500 dark:hover:border-green-500 hover:bg-green-50/50 dark:hover:bg-green-900/10 transition-colors text-left"
                >
                  <span className="font-medium text-gray-900 dark:text-white">
                    {variation.name}
                  </span>
                  <span className="text-green-600 dark:text-green-400 font-semibold">
                    ₹{Math.round(Number(variation.price) || 0)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  )

  if (typeof window !== "undefined") {
    return createPortal(content, document.body)
  }
  return null
}
