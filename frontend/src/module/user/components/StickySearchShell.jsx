import React, { forwardRef } from "react"

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
  const shouldHide = isSearchOpen || !isVisible

  const debugClasses = debug ? "bg-red-500/30 outline outline-2 outline-red-500" : ""

  return (
    <div
      ref={ref}
      style={{
        position: "sticky",
        width: "100%",
        overflow: "hidden",
        pointerEvents: shouldHide ? "none" : "auto",
      }}
      className={[
        topClass,
        zIndexClass,
        shouldHide ? "hidden" : "",
        isSticky
          ? "bg-white dark:bg-[#0a0a0a] shadow-sm border-b border-gray-200 dark:border-gray-800 pt-9 pb-2"
          : "bg-transparent shadow-none border border-transparent",
        debugClasses,
        className,
      ].join(" ")}
    >
      {children}
    </div>
  )
})

export default StickySearchShell

