import { Link } from "react-router-dom"
import { useState, useEffect } from "react"
import { Bell, MapPin, ShoppingCart, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLocation } from "../hooks/useLocation"
import { useCart } from "../context/CartContext"
import { useLocationSelector } from "./UserLayout"
import { useUserNotifications } from "../hooks/useUserNotifications"
import { getCachedSettings, loadBusinessSettings } from "@/lib/utils/businessSettings"
import { pickNavbarLocationLines } from "@/lib/userLocationDisplay"

export default function Navbar() {
  const { location, loading } = useLocation()
  const { getCartCount } = useCart()
  const { openLocationSelector } = useLocationSelector()
  const { unreadCount } = useUserNotifications()
  const cartCount = getCartCount()
  const { main: cityName, sub: stateName } = pickNavbarLocationLines(location)
  const displayMain = cityName === "Select" ? "Select" : cityName
  const displaySub = stateName || "Location"

  const handleLocationClick = () => {
    // Open location selector overlay
    openLocationSelector()
  }

  // Mock points value - replace with actual points from context/store
  const userPoints = 99

  return (
    <nav className="z-50 w-full backdrop-blur-md bg-gradient-to-b from-page-bg/80 via-page-bg/50 to-page-bg/20 border-b border-gray-200/50">
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="flex h-16 sm:h-18 md:h-20 items-center justify-between gap-2 sm:gap-3 md:gap-4">
          {/* Location Section */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            {/* Location - 2 Row Layout */}
            <Button
              variant="ghost"
              onClick={handleLocationClick}
              disabled={loading}
            >
              {loading ? ( 
                <span className="text-xs sm:text-sm font-semibold text-left text-black">
                  Loading...
                </span>
              ) : (
                <div className="flex flex-col items-start w-full min-w-0">
                  <span className="text-xs sm:text-sm flex flex-row items-center gap-1 font-semibold text-left text-foreground truncate w-full">
                    <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-black flex-shrink-0" />
                    {displayMain}
                  </span>
                  {displaySub && (
                    <span className="text-[10px] sm:text-xs text-black pt-1 text-left truncate w-full">
                      {displaySub}
                    </span>
                  )}
                </div>
              )}
            </Button>
          </div>

          <div className="w-8 sm:w-10 md:w-12 flex-shrink-0" aria-hidden />

          {/* Right Side Actions - Profile, Points, Notifications, Cart */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* Points */}
            <Button
              variant="ghost"

              
              size="icon"
              className="relative h-10 w-10 sm:h-11 sm:w-11 md:h-12 md:w-12 hover:bg-gray-100"
              title={`${userPoints} Points`}
            >
              <Trophy className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-primary-orange" />
              <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-primary-orange text-white text-[10px] sm:text-xs flex items-center justify-center font-semibold">
                {userPoints > 999 ? "999+" : userPoints}
              </span>
            </Button>

            <Link to="/user/notifications">
              <Button
                variant="ghost"
                size="icon"
                className="relative h-10 w-10 sm:h-11 sm:w-11 md:h-12 md:w-12 hover:bg-gray-100"
                title="Notifications"
              >
                <Bell className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 sm:min-w-5 sm:h-5 rounded-full bg-red-500 text-white text-[10px] sm:text-xs flex items-center justify-center font-semibold">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>
            </Link>

            {/* Cart */}
            <Link to="/user/cart">
              <Button variant="ghost" size="icon" className="relative h-10 w-10 sm:h-11 sm:w-11 md:h-12 md:w-12 hover:bg-gray-100">
                <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-primary-orange text-white text-[10px] sm:text-xs flex items-center justify-center font-semibold">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </Button>
            </Link>

            {/* Profile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 sm:h-11 sm:w-11 md:h-12 md:w-12 hover:bg-gray-100">
                  <Avatar className="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9">
                    <AvatarFallback className="bg-primary-orange text-white text-xs sm:text-sm md:text-base">
                      A
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <Link to="/user/cart">
                  <DropdownMenuItem>YOUR CART</DropdownMenuItem>
                </Link>
                <Link to="/user/profile">
                  <DropdownMenuItem>Profile</DropdownMenuItem>
                </Link>
                <Link to="/user/orders">
                  <DropdownMenuItem>My Orders</DropdownMenuItem>
                </Link>
                <Link to="/user/offers">
                  <DropdownMenuItem>Offers</DropdownMenuItem>
                </Link>
                <Link to="/user/help">
                  <DropdownMenuItem>Help</DropdownMenuItem>
                </Link>
                <Link to="/user/auth/sign-in">
                  <DropdownMenuItem>Sign Out</DropdownMenuItem>
                </Link>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  )
}
