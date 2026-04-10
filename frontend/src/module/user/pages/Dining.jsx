import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { MapPin, Search, Mic, SlidersHorizontal, Star, X, ArrowDownUp, Timer, IndianRupee, UtensilsCrossed, BadgePercent, ShieldCheck, Clock, Bookmark, Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import AnimatedPage from "../components/AnimatedPage"
import { useLocationSelector } from "../components/UserLayout"
import { useLocation as useLocationHook } from "../hooks/useLocation"
import { useZone } from "../hooks/useZone"
import { useProfile } from "../context/ProfileContext"
import { diningAPI } from "@/lib/api"
import api from "@/lib/api"
import PageNavbar from "../components/PageNavbar"
import OptimizedImage from "@/components/OptimizedImage"
import { pickNavbarLocationLines } from "@/lib/userLocationDisplay"
// Using placeholders for dining card images
const diningCard1 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard2 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard3 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard4 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard5 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard6 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"

// Using placeholders for dining page images
const upto50off = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=200&fit=crop"
const nearAndTopRated = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=200&fit=crop"
// Using placeholder for coffee banner
const coffeeBanner = "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&h=400&fit=crop"
// Using placeholders for bank logos
const axisLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const barodaLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const hdfcLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const iciciLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const pnbLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const sbiLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"

// Mock data removed in favor of dynamic fetching
const diningCategories = []

const limelightRestaurants = []

const bankOffers = []

const MOCK_BANK_OFFERS = bankOffers

const popularRestaurants = []
// Static data removed in favor of dynamic fetching
const MOCK_CATEGORIES = diningCategories
const MOCK_LIMELIGHT = limelightRestaurants
const MOCK_MUST_TRIES = []
const MOCK_RESTAURANTS = popularRestaurants

export default function Dining() {
  const navigate = useNavigate()
  const [heroSearch, setHeroSearch] = useState("")
  const [currentRestaurantIndex, setCurrentRestaurantIndex] = useState(0)
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState('sort')
  const [sortBy, setSortBy] = useState(null)
  const [selectedCuisine, setSelectedCuisine] = useState(null)
  const [selectedBankOffer, setSelectedBankOffer] = useState(null)
  const filterSectionRefs = useRef({})
  const rightContentRef = useRef(null)
  const searchResultsRef = useRef(null)
  const { openLocationSelector } = useLocationSelector()
  const { location, loading: locationLoading } = useLocationHook()
  const { zoneId, currentLocation, locationRefreshKey } = useZone()
  const { main: desktopLocMain, sub: desktopLocSub } = pickNavbarLocationLines(location)
  const { addFavorite, removeFavorite, isFavorite } = useProfile()

  const [categories, setCategories] = useState([])
  const [limelightItems, setLimelightItems] = useState([])
  const [mustTryItems, setMustTryItems] = useState([])
  const [restaurantList, setRestaurantList] = useState([])
  const [bankOfferItems, setBankOfferItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [diningHeroBanner, setDiningHeroBanner] = useState(null)

  useEffect(() => {
    if (!isFilterOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFilterOpen])

  useEffect(() => {
    const fetchDiningHeroBanner = async () => {
      try {
        const response = await api.get('/hero-banners/dining/public')
        if (response.data.success && response.data.data.banners && response.data.data.banners.length > 0) {
          setDiningHeroBanner(response.data.data.banners[0])
        } else {
          setDiningHeroBanner(null)
        }
      } catch (error) {
        console.error("Failed to fetch dining hero banner", error)
        setDiningHeroBanner(null)
      }
    }
    fetchDiningHeroBanner()
  }, [])

  useEffect(() => {
    const fetchDiningData = async () => {
      try {
        setLoading(true)
        setRestaurantList([])
        const restaurantParams = {}
        if (location?.city) {
          restaurantParams.city = location.city
        }
        if (zoneId) {
          restaurantParams.zoneId = zoneId
        }
        if (currentLocation?.latitude && currentLocation?.longitude) {
          restaurantParams.lat = currentLocation.latitude
          restaurantParams.lng = currentLocation.longitude
        }

        const [cats, limes, tries, rests, offers] = await Promise.all([
          diningAPI.getCategories(),
          diningAPI.getOfferBanners(),
          diningAPI.getStories(),
          diningAPI.getRestaurants(restaurantParams),
          diningAPI.getBankOffers()
        ])

        if (cats.data.success && cats.data.data.length > 0) setCategories(cats.data.data)
        if (limes.data.success && limes.data.data.length > 0) {
          setLimelightItems(limes.data.data)
        }
        if (tries.data.success && tries.data.data.length > 0) setMustTryItems(tries.data.data)
        if (rests.data.success && rests.data.data.length > 0) setRestaurantList(rests.data.data)
        if (offers.data.success && offers.data.data.length > 0) setBankOfferItems(offers.data.data)
      } catch (error) {
        console.error("Failed to fetch dining data", error)
      } finally {
        setLoading(false)
      }
    }
    fetchDiningData()
  }, [
    currentLocation?.latitude,
    currentLocation?.longitude,
    location?.city,
    locationRefreshKey,
    zoneId,
  ])

  const toggleFilter = (filterId) => {
    setActiveFilters(prev => {
      const newSet = new Set(prev)
      if (newSet.has(filterId)) {
        newSet.delete(filterId)
      } else {
        newSet.add(filterId)
      }
      return newSet
    })
  }

  const filteredRestaurants = useMemo(() => {
    let filtered = [...restaurantList]

    if (activeFilters.has('delivery-under-30')) {
      filtered = filtered.filter(r => {
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 30
      })
    }
    if (activeFilters.has('delivery-under-45')) {
      filtered = filtered.filter(r => {
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 45
      })
    }
    if (activeFilters.has('distance-under-1km')) {
      filtered = filtered.filter(r => {
        const distMatch = r.distance.match(/(\d+\.?\d*)/)
        return distMatch && parseFloat(distMatch[1]) <= 1.0
      })
    }
    if (activeFilters.has('distance-under-2km')) {
      filtered = filtered.filter(r => {
        const distMatch = r.distance.match(/(\d+\.?\d*)/)
        return distMatch && parseFloat(distMatch[1]) <= 2.0
      })
    }
    if (activeFilters.has('rating-35-plus')) {
      filtered = filtered.filter(r => r.rating >= 3.5)
    }
    if (activeFilters.has('rating-4-plus')) {
      filtered = filtered.filter(r => r.rating >= 4.0)
    }
    if (activeFilters.has('rating-45-plus')) {
      filtered = filtered.filter(r => r.rating >= 4.5)
    }

    // Apply cuisine filter
    if (selectedCuisine) {
      filtered = filtered.filter(r => r.cuisine.toLowerCase().includes(selectedCuisine.toLowerCase()))
    }

    // Apply sorting
    if (sortBy === 'rating-high') {
      filtered.sort((a, b) => b.rating - a.rating)
    } else if (sortBy === 'rating-low') {
      filtered.sort((a, b) => a.rating - b.rating)
    }

    return filtered
  }, [activeFilters, selectedCuisine, sortBy])


  const searchQuery = heroSearch.trim().toLowerCase()

  const searchedCategories = useMemo(() => {
    if (!searchQuery) return []
    return categories.filter((category) =>
      String(category?.name || "").toLowerCase().includes(searchQuery)
    )
  }, [categories, searchQuery])

  const searchedRestaurants = useMemo(() => {
    if (!searchQuery) return []

    return filteredRestaurants.filter((restaurant) => {
      const haystack = [
        restaurant?.name,
        restaurant?.location,
        restaurant?.cuisine,
        restaurant?.featuredDish,
        restaurant?.offer,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(searchQuery)
    })
  }, [filteredRestaurants, searchQuery])

  const handleHeroSearchSubmit = useCallback(() => {
    if (!heroSearch.trim()) {
      return
    }
    searchResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [heroSearch])

  // Auto-play carousel
  useEffect(() => {
    if (limelightItems.length === 0) return

    const interval = setInterval(() => {
      setCurrentRestaurantIndex((prev) => (prev + 1) % limelightItems.length)
    }, 2000) // Change every 2 seconds

    return () => clearInterval(interval)
  }, [limelightItems.length])


  return (
    <AnimatedPage className="bg-white dark:bg-[#0a0a0a]" style={{ minHeight: '100vh', paddingBottom: '80px', overflow: 'visible' }}>
      {/* Unified Navbar & Hero Section */}
      <div
        className="relative w-full overflow-hidden min-h-[36vh] sm:min-h-[40vh] lg:min-h-[min(52vh,560px)] pt-[max(0.5rem,env(safe-area-inset-top,0px))] md:pt-0 max-lg:cursor-pointer lg:cursor-default rounded-b-2xl md:rounded-b-none lg:rounded-b-none"
        onClick={(e) => {
          if (e.target.closest("[data-dining-hero-interactive]")) return
          if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) return
          navigate("/user/dining/restaurants")
        }}
      >
        {/* Background — full banner on small screens only */}
        <div className="hidden absolute top-0 left-0 right-0 bottom-0 z-0 lg:hidden">
          {diningHeroBanner && (
            <OptimizedImage
              src={diningHeroBanner}
              alt="Dining Banner"
              className="w-full h-full object-cover"
              objectFit="cover"
              priority={true}
              sizes="100vw"
            />
          )}
        </div>

        {/* Desktop: Tastizo green hero (Swiggy-style layout, no orange) */}
        <div
          className="pointer-events-none hidden lg:block absolute inset-0 z-0 bg-gradient-to-br from-[#2B9C64] via-[#259052] to-[#1a5c38]"
          aria-hidden
        />
        <div
          className="pointer-events-none hidden lg:block absolute -right-24 top-12 h-[360px] w-[360px] rounded-full bg-white/[0.07] blur-3xl"
          aria-hidden
        />

        {/* Navbar */}
        <div className="relative z-20 pt-2 sm:pt-3 lg:pt-4" data-dining-hero-interactive>
          <PageNavbar
            textColor="white"
            zIndex={20}
            showLocation={false}
            brandOnLeftMobile={true}
            onNavClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Hero — mobile / tablet */}
        <section
          className="relative z-20 w-full px-4 pb-3 pt-2 sm:px-6 sm:pb-4 sm:pt-3 lg:hidden"
          data-dining-hero-interactive
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative mx-auto max-w-sm overflow-hidden rounded-[28px] shadow-[0_22px_50px_rgba(29,23,18,0.22)]">
            <div className="absolute inset-0">
              {diningHeroBanner && (
                <OptimizedImage
                  src={diningHeroBanner}
                  alt="Dining Banner"
                  className="h-full w-full"
                  objectFit="cover"
                  priority={true}
                  sizes="(max-width: 640px) 100vw, 420px"
                />
              )}
              {!diningHeroBanner && (
                <div className="h-full w-full bg-gradient-to-br from-[#6b4b3e] via-[#3f2a22] to-[#1f1612]" />
              )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-[#2f1c14]/85 via-[#40271d]/35 to-black/35" />
            <div className="relative flex min-h-[272px] flex-col justify-end px-4 pb-4 pt-14 sm:min-h-[310px] sm:px-5 sm:pb-5">
              <div className="max-w-[12rem]">
                <h1 className="text-[2rem] font-black leading-[0.95] tracking-tight text-white drop-shadow-md sm:text-[2.35rem]">
                  Discover Artful Dining
                </h1>
              </div>
              <div className="mt-4 rounded-full bg-white p-1.5 shadow-lg">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleHeroSearchSubmit}
                    className="ml-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400"
                  >
                    <Search className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                  <Input
                    value={heroSearch}
                    onChange={(e) => setHeroSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleHeroSearchSubmit()
                      }
                    }}
                    className="h-9 flex-1 border-0 bg-transparent px-0 text-sm font-medium text-gray-700 placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder="Search for experiences"
                  />
                  <button
                    type="button"
                    onClick={handleHeroSearchSubmit}
                    className="mr-1 inline-flex h-9 items-center justify-center rounded-full bg-[#ee5a62] px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#e34d56]"
                  >
                    Find
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Hero — desktop: headline + location + search */}
        <section
          className="relative z-20 hidden lg:block w-full px-8 xl:px-12 pb-14 pt-6"
          data-dining-hero-interactive
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-w-5xl xl:max-w-6xl mx-auto">
            <h1 className="text-center text-white text-4xl xl:text-[2.5rem] font-extrabold leading-tight tracking-tight">
              Dine out &amp; reserve tables.
              <span className="block mt-2 text-2xl xl:text-[1.75rem] font-bold text-white/95">
                Explore dining experiences with Tastizo
              </span>
            </h1>
            <div className="mt-10 flex flex-row items-stretch gap-4 max-w-4xl mx-auto">
              <button
                type="button"
                onClick={() => openLocationSelector()}
                className="flex-shrink-0 w-[min(100%,300px)] rounded-2xl bg-white shadow-lg border border-white/30 px-4 py-3 text-left flex items-start gap-3 hover:bg-gray-50 transition-colors"
              >
                <MapPin className="h-5 w-5 text-[#2B9C64] shrink-0 mt-0.5" strokeWidth={2.5} />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Location</span>
                  <p className="font-bold text-gray-900 truncate">
                    {locationLoading ? "Locating…" : desktopLocMain || "Set your area"}
                  </p>
                  {desktopLocSub ? (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{desktopLocSub}</p>
                  ) : null}
                </div>
                <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="h-full rounded-2xl bg-white shadow-lg border border-white/30 p-2 flex items-center gap-3">
                  <Search className="h-5 w-5 text-[#2B9C64] flex-shrink-0 ml-3" strokeWidth={2.5} />
                  <Input
                    value={heroSearch}
                    onChange={(e) => setHeroSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && heroSearch.trim()) {
                        handleHeroSearchSubmit()
                      }
                    }}
                    className="h-11 flex-1 bg-transparent border-0 text-base font-semibold text-gray-800 focus-visible:ring-0 pr-2"
                    placeholder='Search restaurants, cuisine, area'
                  />
                  <button
                    type="button"
                    onClick={handleHeroSearchSubmit}
                    className="flex-shrink-0 mr-2 p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <Mic className="h-5 w-5 text-gray-500" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => navigate("/user/dining/restaurants")}
                className="text-sm font-semibold text-white/95 underline-offset-4 hover:underline"
              >
                Browse all restaurants →
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Content */}
      <div className={`${isFilterOpen ? 'hidden' : 'block'} max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 pt-6 sm:pt-8 md:pt-10 lg:pt-10 pb-6 md:pb-8 lg:pb-10`}>
        {searchQuery && (
          <div ref={searchResultsRef} className="mb-8 space-y-8">
            <div className="px-1">
              <h2 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                Dining search results
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Showing matches for "{heroSearch.trim()}" only from dining categories and dining restaurants.
              </p>
            </div>

            {searchedCategories.length > 0 && (
              <section className="space-y-4">
                <div className="px-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Matching categories</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5 lg:max-w-5xl">
                  {searchedCategories.map((category, index) => (
                    <Link
                      key={category._id || category.id}
                      to={`/user/dining/${category.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <motion.div
                        className="group relative overflow-hidden rounded-[18px] bg-gray-100 cursor-pointer aspect-[1/1] min-h-[98px] shadow-sm ring-1 ring-black/5"
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-50px" }}
                        transition={{ duration: 0.3, delay: index * 0.04 }}
                      >
                        <OptimizedImage
                          src={category.imageUrl}
                          alt={category.name}
                          className="w-full h-full"
                          objectFit="cover"
                          sizes="160px"
                          placeholder="blur"
                        />
                        <div className="absolute inset-0 bg-black/30" />
                        <div className="absolute inset-0 flex items-center justify-center px-3">
                          <p className="max-w-[85%] text-center text-sm font-extrabold tracking-tight text-white drop-shadow-md">
                            {category.name}
                          </p>
                        </div>
                      </motion.div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {searchedRestaurants.length > 0 && (
              <section className="space-y-4">
                <div className="px-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Matching restaurants</h3>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {searchedRestaurants.map((restaurant, index) => {
                    const restaurantSlug = restaurant.slug || restaurant.name?.toLowerCase().replace(/\s+/g, "-")
                    const restaurantImage = restaurant.image || restaurant.imageUrl

                    return (
                      <Link key={restaurant._id || restaurant.id || restaurantSlug} to={`/user/dining/restaurants/${restaurantSlug}`}>
                        <motion.div
                          className="overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/5 dark:bg-[#111111]"
                          initial={{ opacity: 0, y: 12 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true, margin: "-50px" }}
                          transition={{ duration: 0.3, delay: index * 0.04 }}
                        >
                          <div className="relative h-44 w-full overflow-hidden">
                            <img
                              src={restaurantImage}
                              alt={restaurant.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="space-y-1 px-4 py-4">
                            <h4 className="text-lg font-bold text-gray-900 dark:text-white">{restaurant.name}</h4>
                            {restaurant.cuisine && (
                              <p className="text-sm text-gray-600 dark:text-gray-300">{restaurant.cuisine}</p>
                            )}
                            {restaurant.location && (
                              <p className="text-sm text-gray-500 dark:text-gray-400">{restaurant.location}</p>
                            )}
                          </div>
                        </motion.div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}

            {searchedCategories.length === 0 && searchedRestaurants.length === 0 && (
              <div className="rounded-3xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">No dining matches found</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Try a category like cafe, buffet, family dining, or search for a dining restaurant name.
                </p>
              </div>
            )}
          </div>
        )}

        {!searchQuery && (
        <>
        {/* Categories Section */}
        <div className="mb-6 lg:mb-12">
          <div className="mb-4 flex items-end justify-between px-1 lg:block lg:text-center lg:max-w-2xl lg:mx-auto lg:mb-8">
            <div>
              <h2 className="max-w-[12rem] text-[1.65rem] font-black leading-[1.05] text-gray-900 dark:text-white tracking-tight sm:max-w-none sm:text-xl lg:text-3xl">
                Explore dining experiences
              </h2>
              <p className="mt-1 hidden text-xs text-gray-500 dark:text-gray-400 sm:block sm:text-sm lg:text-base">
                Choose a vibe to discover great places nearby.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/user/dining/restaurants")}
              className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#e45a61] transition-colors hover:bg-rose-50 lg:hidden"
              aria-label="Browse dining restaurants"
            >
              <span className="text-xl leading-none">→</span>
            </button>
            <p className="mt-1 hidden text-xs sm:text-sm lg:text-base text-gray-500 dark:text-gray-400 lg:block">
              Choose a vibe to discover great places nearby.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5 lg:max-w-5xl lg:mx-auto">
            {categories.map((category, index) => (
              <Link
                key={category._id || category.id}
                to={`/user/dining/${category.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <motion.div
                  className="group relative overflow-hidden rounded-[18px] sm:rounded-[22px] lg:rounded-[26px] bg-gray-100 cursor-pointer aspect-[1/1] min-h-[98px] sm:min-h-[118px] md:min-h-[130px] lg:min-h-[132px] shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:shadow-md lg:hover:shadow-lg"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  whileHover={{ y: -4, scale: 1.02 }}
                >
                  {/* Full-size image */}
                  <OptimizedImage
                    src={category.imageUrl}
                    alt={category.name}
                    className="w-full h-full"
                    objectFit="cover"
                    sizes="160px"
                    placeholder="blur"
                    priority={index < 4}
                  />

                  {/* Subtle overlay for readability */}
                  <div className="absolute inset-0 bg-black/28 transition-colors duration-300 group-hover:bg-black/34" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/48 via-black/18 to-white/5 opacity-95" />

                  {/* Category name */}
                  <div className="absolute inset-0 flex items-center justify-center px-3">
                    <p className="max-w-[85%] text-center text-sm sm:text-base lg:text-lg font-sans font-extrabold tracking-tight text-white leading-tight drop-shadow-md">
                      {category.name}
                    </p>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>

        {/* In the Limelight Section */}
        <div className="mb-6 mt-8 sm:mt-12 lg:mt-14">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 px-1 lg:justify-center">
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                In the Limelight
              </h3>
            </div>
          </div>

          {/* Landscape Carousel — shorter on desktop */}
          <div className="relative w-full h-[200px] sm:h-[280px] md:h-[350px] lg:h-[300px] lg:max-w-5xl lg:mx-auto rounded-2xl lg:rounded-3xl overflow-hidden shadow-lg lg:shadow-xl">
            {/* Carousel Container */}
            <div
              className="flex h-full transition-transform duration-700 ease-in-out"
              style={{ transform: `translateX(-${currentRestaurantIndex * 100}%)` }}
            >
              {limelightItems.map((restaurant, index) => (
                <div
                  key={restaurant._id || restaurant.id}
                  className="min-w-full h-full relative flex-shrink-0 w-full cursor-pointer"
                  onClick={() => navigate(`/dining/restaurants/${restaurant.restaurant?.slug || restaurant.restaurant?._id}`)}
                >
                  {/* Restaurant Image */}
                  <OptimizedImage
                    src={restaurant.imageUrl}
                    alt={restaurant.tagline}
                    className="w-full h-full"
                    objectFit="cover"
                    sizes="100vw"
                    placeholder="blur"
                    priority={index === 0}
                  />

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-90" />

                  {/* Content Container */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 z-10 flex flex-col items-start gap-2">
                    {/* Discount Badge */}
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-green-500 text-white px-3 py-1 rounded-full shadow-lg mb-1"
                    >
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                        {restaurant.percentageOff}
                      </span>
                    </motion.div>

                    {/* Restaurant Name */}
                    <motion.h4
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight drop-shadow-lg"
                    >
                      {restaurant.restaurant?.name}
                    </motion.h4>

                    {/* Tagline */}
                    <motion.p
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="text-sm sm:text-base font-medium text-gray-200 line-clamp-1 max-w-[90%]"
                    >
                      {restaurant.tagline}
                    </motion.p>
                  </div>
                </div>
              ))}
            </div>

            {/* Carousel Indicators */}
            <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-10 flex gap-2">
              {limelightItems.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentRestaurantIndex(index)}
                  className={`h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full transition-all ${index === currentRestaurantIndex
                    ? "bg-white w-6 sm:w-8"
                    : "bg-white/50"
                    }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>



        {/* Stories / must-try picks section */}
        <div className="mb-6 mt-8 sm:mt-12 lg:mt-14">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 px-1 lg:justify-center">
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                Dining stories & must‑tries
              </h3>
            </div>
          </div>

          {/* Mobile: horizontal scroll · Desktop: wrapped grid */}
          <div
            className="overflow-x-auto -mx-4 sm:-mx-6 lg:-mx-0 lg:overflow-visible px-4 sm:px-6 lg:px-0 max-w-6xl lg:mx-auto"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            <style>{`
              .must-tries-scroll::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            <div className="flex gap-4 pb-4 must-tries-scroll w-max lg:w-full lg:flex-wrap lg:justify-center lg:gap-5 lg:pb-0">
              {mustTryItems.map((item, index) => (
                <motion.div
                  key={item._id || item.id}
                  className="relative flex-shrink-0 rounded-xl lg:rounded-2xl overflow-hidden shadow-sm lg:shadow-md cursor-pointer w-[calc((100vw-3rem)/2.5)] min-w-[140px] max-w-[200px] lg:w-[220px] lg:min-w-[220px] lg:max-w-[240px]"
                  onClick={() => navigate(`/user/search?q=${encodeURIComponent(item.name)}`)}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  whileHover={{ y: -8, scale: 1.05 }}
                >
                  <div className="relative h-48 sm:h-56 md:h-64 overflow-hidden">
                    <motion.div
                      className="absolute inset-0"
                      whileHover={{ scale: 1.15 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    >
                      <OptimizedImage
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full"
                        objectFit="cover"
                        sizes="(max-width: 640px) 40vw, 200px"
                        placeholder="blur"
                      />
                    </motion.div>
                    {/* White Subheading Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/50 to-transparent p-3 sm:p-2 z-10">
                      <h4 className="text-white text-md sm:text-md font-bold text-start">
                        {item.name}
                      </h4>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Explore More Button */}
          {/* <div className="flex justify-center mt-6">
            <Button
              variant="ghost"
              className="px-6 py-2 text-sm font-semibold"
            >
              Explore More
            </Button>
          </div> */}
        </div>

        </>
        )}
      </div>

      {/* Filter Modal */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-[100000]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsFilterOpen(false)}
          />

          {/* Modal Content */}
          <div className="absolute bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-4xl z-[100001] bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl max-h-[85vh] md:max-h-[90vh] flex flex-col overflow-hidden isolate animate-[slideUp_0.3s_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 md:px-6 py-4 md:py-5 border-b dark:border-gray-800">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">Filters and sorting</h2>
              <button
                onClick={() => {
                  setActiveFilters(new Set())
                  setSortBy(null)
                  setSelectedCuisine(null)
                }}
                className="text-green-600 dark:text-green-400 font-medium text-sm md:text-base"
              >
                Clear all
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 min-h-0 overflow-hidden bg-white dark:bg-[#1a1a1a]">
              {/* Left Sidebar - Tabs */}
              <div className="w-24 sm:w-28 md:w-32 shrink-0 bg-gray-50 dark:bg-[#0a0a0a] border-r dark:border-gray-800 flex flex-col">
                {[
                  { id: 'sort', label: 'Sort By', icon: ArrowDownUp },
                  { id: 'time', label: 'Time', icon: Timer },
                  { id: 'rating', label: 'Rating', icon: Star },
                  { id: 'distance', label: 'Distance', icon: MapPin },
                  { id: 'price', label: 'Dish Price', icon: IndianRupee },
                  { id: 'cuisine', label: 'Cuisine', icon: UtensilsCrossed },
                ].map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeFilterTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveFilterTab(tab.id)}
                      className={`flex flex-col items-center gap-1 py-4 px-2 text-center relative transition-colors ${isActive ? 'bg-white dark:bg-[#1a1a1a] text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-600 rounded-r" />
                      )}
                      <Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={1.5} />
                      <span className="text-xs md:text-sm font-medium leading-tight">{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Right Content Area - Scrollable */}
              <div ref={rightContentRef} className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-white dark:bg-[#1a1a1a] p-4 md:p-6">
                {/* Sort By Tab */}
                {activeFilterTab === 'sort' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">Sort by</h3>
                    <div className="flex flex-col gap-3 md:gap-4">
                      {[
                        { id: null, label: 'Relevance' },
                        { id: 'rating-high', label: 'Rating: High to Low' },
                        { id: 'rating-low', label: 'Rating: Low to High' },
                      ].map((option) => (
                        <button
                          key={option.id || 'relevance'}
                          onClick={() => setSortBy(option.id)}
                          className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-left transition-colors ${sortBy === option.id
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                            }`}
                        >
                          <span className={`text-sm md:text-base font-medium ${sortBy === option.id ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            {option.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Time Tab */}
                {activeFilterTab === 'time' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Delivery Time</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('delivery-under-30')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('delivery-under-30')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-30') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('delivery-under-30') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under 30 mins</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('delivery-under-45')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('delivery-under-45')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-45') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('delivery-under-45') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under 45 mins</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Rating Tab */}
                {activeFilterTab === 'rating' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Restaurant Rating</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('rating-35-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-35-plus')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-35-plus') ? 'text-green-600 dark:text-green-400 fill-green-600 dark:fill-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-35-plus') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Rated 3.5+</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('rating-4-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-4-plus')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-4-plus') ? 'text-green-600 dark:text-green-400 fill-green-600 dark:fill-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-4-plus') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Rated 4.0+</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('rating-45-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-45-plus')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-45-plus') ? 'text-green-600 dark:text-green-400 fill-green-600 dark:fill-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-45-plus') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Rated 4.5+</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Distance Tab */}
                {activeFilterTab === 'distance' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Distance</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('distance-under-1km')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('distance-under-1km')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-1km') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('distance-under-1km') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under 1 km</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('distance-under-2km')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('distance-under-2km')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-2km') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('distance-under-2km') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under 2 km</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Price Tab */}
                {activeFilterTab === 'price' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Dish Price</h3>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => toggleFilter('price-under-200')}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('price-under-200')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <span className={`text-sm font-medium ${activeFilters.has('price-under-200') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹200</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('price-under-500')}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('price-under-500')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <span className={`text-sm font-medium ${activeFilters.has('price-under-500') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹500</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Cuisine Tab */}
                {activeFilterTab === 'cuisine' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cuisine</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {['Continental', 'Italian', 'Asian', 'Indian', 'Chinese', 'American', 'Seafood', 'Cafe'].map((cuisine) => (
                        <button
                          key={cuisine}
                          onClick={() => setSelectedCuisine(selectedCuisine === cuisine ? null : cuisine)}
                          className={`px-4 py-3 rounded-xl border text-center transition-colors ${selectedCuisine === cuisine
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                            }`}
                        >
                          <span className={`text-sm font-medium ${selectedCuisine === cuisine ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            {cuisine}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 md:gap-6 px-4 md:px-6 py-4 md:py-5 border-t dark:border-gray-800 bg-white dark:bg-[#1a1a1a]">
              <button
                onClick={() => setIsFilterOpen(false)}
                className="flex-1 py-3 md:py-4 text-center font-semibold text-gray-700 dark:text-gray-300 text-sm md:text-base"
              >
                Close
              </button>
              <button
                onClick={() => setIsFilterOpen(false)}
                className={`flex-1 py-3 md:py-4 font-semibold rounded-xl transition-colors text-sm md:text-base ${activeFilters.size > 0 || sortBy || selectedCuisine
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
              >
                {activeFilters.size > 0 || sortBy || selectedCuisine
                  ? `Show ${filteredRestaurants.length} results`
                  : 'Show results'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatedPage>
  )
}
