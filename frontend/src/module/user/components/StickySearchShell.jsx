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
  // If the full-screen search overlay is open, collapse this element to avoid blank spacing.
  const shouldHide = isSearchOpen || !isVisible
  const searchHiddenClasses = shouldHide
    ? "pointer-events-none opacity-0 max-h-0 overflow-hidden pt-0 pb-0"
    : "opacity-100 max-h-[200px] overflow-hidden pt-6 pb-2"

  const debugClasses = debug ? "bg-red-500/30 outline outline-2 outline-red-500" : ""

  return (
    <div
      ref={ref}
      className={[
        "sticky",
        topClass,
        zIndexClass,
        "w-full",
        "transition-[box-shadow,background-color,backdrop-filter,transform,opacity,max-height,padding-top,padding-bottom]",
        "duration-300",
        "ease-in-out",
        searchHiddenClasses,
        isSticky
          ? "bg-white dark:bg-[#0a0a0a] shadow-sm border-b border-gray-200 dark:border-gray-800"
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

