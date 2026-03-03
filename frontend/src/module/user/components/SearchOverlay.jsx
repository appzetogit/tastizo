import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { X, Search, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { restaurantAPI } from "@/lib/api"
import { foodImages } from "@/constants/images"

const SEARCH_HISTORY_KEY = "user_search_history_v1"
const MAX_HISTORY_ITEMS = 10

export default function SearchOverlay({ isOpen, onClose, searchValue, onSearchChange }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [allFoods, setAllFoods] = useState([])
  const [filteredFoods, setFilteredFoods] = useState([])
  const [recentSearches, setRecentSearches] = useState([])
  const [loadingFoods, setLoadingFoods] = useState(false)

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = "unset"
    }
  }, [isOpen, onClose])

  // Load recent searches from localStorage when overlay opens
  useEffect(() => {
    if (!isOpen) return
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const cleaned = parsed
            .filter((item) => typeof item === "string" && item.trim().length > 0)
            .slice(0, MAX_HISTORY_ITEMS)
          setRecentSearches(cleaned)
        }
      }
    } catch (error) {
      console.warn("Failed to load search history:", error)
    }
  }, [isOpen])

  // Load real dish suggestions from backend restaurants (featured dishes)
  useEffect(() => {
    if (!isOpen || allFoods.length > 0 || loadingFoods) return

    const loadFoods = async () => {
      try {
        setLoadingFoods(true)
        const response = await restaurantAPI.getRestaurants({})
        const restaurants = response?.data?.data?.restaurants || []

        const foods = restaurants
          .map((restaurant, index) => {
            // Show restaurant cards (not dish names)
            const name = restaurant.name || restaurant.featuredDish
            if (!name) return null

            const coverImages = restaurant.coverImages && restaurant.coverImages.length > 0
              ? restaurant.coverImages.map((img) => img.url || img).filter(Boolean)
              : []

            const fallbackImages = restaurant.menuImages && restaurant.menuImages.length > 0
              ? restaurant.menuImages.map((img) => img.url || img).filter(Boolean)
              : []

            const allImages = coverImages.length > 0
              ? coverImages
              : (fallbackImages.length > 0
                ? fallbackImages
                : (restaurant.profileImage?.url ? [restaurant.profileImage.url] : []))

            const image = allImages[0] || foodImages[0]
            const slug =
              restaurant.slug ||
              (restaurant.name || "")
                .toLowerCase()
                .trim()
                .replace(/\s+/g, "-")

            return {
              id: restaurant.restaurantId || restaurant._id || index,
              name,
              image,
              restaurantSlug: slug,
              featuredDish: restaurant.featuredDish || null,
            }
          })
          .filter(Boolean)

        setAllFoods(foods)
        setFilteredFoods(foods)
      } catch (error) {
        console.error("Error loading search suggestions:", error)
        setAllFoods([])
        setFilteredFoods([])
      } finally {
        setLoadingFoods(false)
      }
    }

    loadFoods()
  }, [isOpen, allFoods.length, loadingFoods])

  // Filter foods based on search input
  useEffect(() => {
    if (!allFoods || allFoods.length === 0) {
      setFilteredFoods([])
      return
    }

    if (searchValue.trim() === "") {
      setFilteredFoods(allFoods)
    } else {
      const query = searchValue.toLowerCase()
      const filtered = allFoods.filter((food) =>
        food.name.toLowerCase().includes(query)
      )
      setFilteredFoods(filtered)
    }
  }, [searchValue, allFoods])

  const saveSearchToHistory = (term) => {
    const value = term.trim()
    if (!value) return

    setRecentSearches((prev) => {
      const existing = prev.filter(
        (item) => item.toLowerCase() !== value.toLowerCase()
      )
      const updated = [value, ...existing].slice(0, MAX_HISTORY_ITEMS)
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated))
      } catch (error) {
        console.warn("Failed to save search history:", error)
      }
      return updated
    })
  }

  const clearRecentSearches = () => {
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY)
    } catch (error) {
      console.warn("Failed to clear search history:", error)
    }
    setRecentSearches([])
  }

  const handleSuggestionClick = (suggestion) => {
    onSearchChange(suggestion)
    saveSearchToHistory(suggestion)
    inputRef.current?.focus()
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchValue.trim()) {
      saveSearchToHistory(searchValue.trim())
      navigate(`/user/search?q=${encodeURIComponent(searchValue.trim())}`)
      onClose()
      onSearchChange("")
    }
  }

  const handleFoodClick = (food) => {
    saveSearchToHistory(food.name)

    if (food.restaurantSlug) {
      // Go directly to the restaurant menu page with a dish search query
      navigate(
        `/user/restaurants/${food.restaurantSlug}?q=${encodeURIComponent(
          food.name,
        )}`,
      )
    } else {
      // Fallback: use generic search results page
      navigate(`/user/search?q=${encodeURIComponent(food.name)}`)
    }

    onClose()
    onSearchChange("")
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-[#0a0a0a]"
      style={{
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
      {/* Header with Search Bar */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground dark:text-gray-400 z-10" />
              <Input
                ref={inputRef}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search for food, restaurants..."
                className="pl-12 pr-4 h-12 w-full bg-white dark:bg-[#1a1a1a] border-gray-100 dark:border-gray-800 focus:border-primary-orange dark:focus:border-primary-orange rounded-full text-lg dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </Button>
          </form>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 scrollbar-hide bg-white dark:bg-[#0a0a0a]">
        {/* Suggestions Row */}
        <div
          className="mb-6"
          style={{
            animation: 'slideDown 0.3s ease-out 0.1s both'
          }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-orange" />
              Recent Searches
            </h3>
            {recentSearches.length > 0 && (
              <button
                type="button"
                onClick={clearRecentSearches}
                className="text-[11px] sm:text-xs font-medium text-gray-500 hover:text-red-500 underline-offset-2 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          {recentSearches.length > 0 ? (
            <div className="flex gap-2 sm:gap-3 flex-wrap">
              {recentSearches.map((suggestion, index) => (
                <button
                  key={`${suggestion}-${index}`}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 border border-orange-200 dark:border-orange-800 hover:border-orange-300 dark:hover:border-orange-700 text-gray-700 dark:text-gray-300 hover:text-primary-orange dark:hover:text-orange-400 transition-all duration-200 text-xs sm:text-sm font-medium shadow-sm hover:shadow-md"
                  style={{
                    animation: `scaleIn 0.3s ease-out ${0.1 + index * 0.02}s both`
                  }}
                >
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-primary-orange flex-shrink-0" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              Start searching to build your recent history.
            </p>
          )}
        </div>

        {/* Food Grid */}
        <div
          style={{
            animation: 'fadeIn 0.3s ease-out 0.2s both'
          }}
        >
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
            {searchValue.trim() === ""
              ? "Popular restaurants around you"
              : `Search Results (${filteredFoods.length})`}
          </h3>
          {loadingFoods ? (
            <div className="text-center py-12 sm:py-16 text-sm sm:text-base text-gray-500 dark:text-gray-400">
              Loading restaurants...
            </div>
          ) : filteredFoods.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
              {filteredFoods.map((food, index) => (
                <div
                  key={food.id}
                  className="flex flex-col items-center gap-2 sm:gap-3 cursor-pointer group"
                  style={{
                    animation: `slideUp 0.3s ease-out ${0.25 + 0.05 * (index % 12)}s both`
                  }}
                  onClick={() => handleFoodClick(food)}
                >
                  <div className="relative w-full aspect-square rounded-full overflow-hidden transition-all duration-200 shadow-md group-hover:shadow-lg bg-white dark:bg-[#1a1a1a] p-1 sm:p-1.5">
                    <img
                      src={food.image}
                      alt={food.name}
                      className="w-full h-full object-cover rounded-full"
                      loading="lazy"
                      onError={(e) => {
                        e.target.src = foodImages[0]
                      }}
                    />
                  </div>
                  <div className="px-1 sm:px-2 text-center">
                    <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 group-hover:text-primary-orange dark:group-hover:text-orange-400 transition-colors line-clamp-2">
                      {food.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 sm:py-16">
              <Search className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg font-semibold">No results found for "{searchValue}"</p>
              <p className="text-sm sm:text-base text-gray-500 dark:text-gray-500 mt-2">Try a different search term</p>
            </div>
          )}
        </div>
      </div>
      <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes scaleIn {
            from {
              opacity: 0;
              transform: scale(0.9);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}</style>
    </div>
  )
}

