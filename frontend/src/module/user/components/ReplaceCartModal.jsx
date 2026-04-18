import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { MapPin, ShoppingBag, X } from "lucide-react"

/**
 * Modal shown when user tries to add item from a different restaurant.
 * Asks if they want to replace cart (discard current items and add from new restaurant).
 */
export default function ReplaceCartModal({
  isOpen,
  mode = "restaurant",
  cartRestaurantName,
  newRestaurantName,
  itemCount = 0,
  currentZoneName = "",
  currentAddress = "",
  onReplace,
  onCancel,
}) {
  if (!isOpen) return null

  const isLocationChange = mode === "location"

  const content = (
    <AnimatePresence>
      <>
        <motion.div
          className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
        <motion.div
          className="relative z-[10000] bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative p-6">
            <button
              type="button"
              onClick={onCancel}
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white pr-8">
              {isLocationChange ? "Change location?" : "Replace cart item?"}
            </h3>
            {isLocationChange ? (
              <>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Your cart has items from{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {cartRestaurantName || "another restaurant"}
                  </span>
                  . This restaurant may not deliver to your new location.
                </p>

                <div className="mt-5 space-y-3">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
                    <div className="flex items-start gap-3">
                      <ShoppingBag className="mt-0.5 h-4 w-4 text-[#2B9C64]" />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Current cart
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                          {cartRestaurantName || "Restaurant"}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {itemCount || 0} {itemCount === 1 ? "item" : "items"} will be removed
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 text-[#2B9C64]" />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          New delivery area
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                          {currentZoneName || "Selected location"}
                        </p>
                        {currentAddress && (
                          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                            {currentAddress}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Your cart contains dishes from{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {cartRestaurantName || "another restaurant"}
                </span>
                . Do you want to discard the selection and add dishes from{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {newRestaurantName || "this restaurant"}
                </span>
                ?
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {isLocationChange ? "Not now" : "No"}
              </button>
              <button
                type="button"
                onClick={onReplace}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-[#2B9C64] hover:bg-[#218a56] transition-colors shadow-sm"
              >
                {isLocationChange ? "Change location" : "Replace"}
              </button>
            </div>
          </div>
        </motion.div>
        </motion.div>
      </>
    </AnimatePresence>
  )

  if (typeof window !== "undefined") {
    return createPortal(content, document.body)
  }
  return null
}
