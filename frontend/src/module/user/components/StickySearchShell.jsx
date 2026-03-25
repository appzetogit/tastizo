import React, { forwardRef } from "react"
import { motion, AnimatePresence } from "framer-motion"

/**
 * Visual wrapper for Swiggy/Zomato-style sticky search bars.
 * Keeps layout smooth by letting the parent control spacing (e.g. category offset).
 */
const StickySearchShell = forwardRef(function StickySearchShell(
  {
    children,
    topClass = "top-4",
    zIndexClass = "z-[9999]",
    isSearchOpen = false,
    isVisible = true,
    isSticky = false,
    className = "",
    debug = false,
  },
  ref
) {
  // If the full-screen search overlay is open, collapse this element to avoid blank spacing.
  const shouldHide = isSearchOpen || !isVisible

  const debugClasses = debug ? "bg-red-500/30 outline outline-2 outline-red-500" : ""

  return (
    <motion.div
      ref={ref}
      layout
      initial={false}
      animate={{
        height: shouldHide ? 0 : "auto",
        opacity: shouldHide ? 0 : 1,
        y: shouldHide ? -20 : 0,
        pointerEvents: shouldHide ? "none" : "auto",
        paddingTop: shouldHide ? 0 : (isSticky ? 36 : "inherit"),
        paddingBottom: shouldHide ? 0 : (isSticky ? 8 : "inherit")
      }}
      transition={{
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1],
        opacity: { duration: 0.2 }
      }}
      style={{
        position: "sticky",
        width: "100%",
        overflow: "hidden"
      }}
      className={[
        topClass,
        zIndexClass,
        isSticky
          ? "bg-white dark:bg-[#0a0a0a] shadow-sm border-b border-gray-200 dark:border-gray-800"
          : "bg-transparent shadow-none border border-transparent",
        debugClasses,
        className,
      ].join(" ")}
    >
      {children}
    </motion.div>
  )
})

export default StickySearchShell

