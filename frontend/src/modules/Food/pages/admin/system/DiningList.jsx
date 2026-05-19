import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Search, Download, ChevronDown, Eye, Settings, ArrowUpDown, Loader2, Star, Building2, User, FileText, Phone, Mail, MapPin, ShieldX, Trash2, ArrowRight, Plus, DollarSign, TrendingUp } from "lucide-react"
import { adminAPI, diningAPI } from "@food/api"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@food/components/ui/dropdown-menu"
import { exportRestaurantsToPDF } from "@food/components/admin/restaurants/restaurantsExportUtils"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const normalizeImageUrl = (image) => {
    if (!image) return ""
    if (typeof image === "string") return image
    if (typeof image === "object") return image.url || image.secure_url || ""
    return ""
}

const getPrimaryRestaurantImage = (restaurant, fallback = "") => {
    const coverImages = Array.isArray(restaurant?.coverImages) ? restaurant.coverImages : []
    const firstCoverImage = coverImages.map(normalizeImageUrl).find(Boolean)
    if (firstCoverImage) return firstCoverImage

    const menuImages = Array.isArray(restaurant?.menuImages) ? restaurant.menuImages : []
    const firstMenuImage = menuImages.map(normalizeImageUrl).find(Boolean)
    if (firstMenuImage) return firstMenuImage

    return (
        normalizeImageUrl(restaurant?.profileImage) ||
        normalizeImageUrl(restaurant?.logo) ||
        fallback
    )
}


export default function DiningList() {
    const navigate = useNavigate()
    const [searchQuery, setSearchQuery] = useState("")
    const [restaurants, setRestaurants] = useState([])
    const [categories, setCategories] = useState([])
    const [selectedCategory, setSelectedCategory] = useState("All")
    const [loading, setLoading] = useState(true)
    const [categoryLoading, setCategoryLoading] = useState(true)
    const [error, setError] = useState(null)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [editingRestaurant, setEditingRestaurant] = useState(null)
    const [activeTab, setActiveTab] = useState("restaurants") // "restaurants", "ledger"
    const [bookings, setBookings] = useState([])

    useEffect(() => {
        const fetchBookings = async () => {
            try {
                const response = await diningAPI.getBookings()
                if (response.data.success) {
                    setBookings(response.data.data)
                }
            } catch (err) {
                // Fallback to local storage directly if API fails or mock database is active
                const stored = localStorage.getItem("food_dining_bookings_v1")
                if (stored) {
                    setBookings(JSON.parse(stored))
                }
            }
        }
        fetchBookings()
    }, [activeTab])

    // Fetch restaurants from backend API
    useEffect(() => {
        let isInitialLoad = true;
        
        const fetchRestaurants = async () => {
            try {
                if (isInitialLoad) {
                    setLoading(true)
                }
                setError(null)

                const response = await adminAPI.getDiningRestaurants()

                if (response.data && response.data.success && response.data.data) {
                    const restaurantsData = response.data.data.restaurants || []

                    const mappedRestaurants = restaurantsData.map((restaurant, index) => ({
                        id: restaurant._id || restaurant.id || index + 1,
                        _id: restaurant._id,
                        name: restaurant.name || restaurant.restaurantName || "N/A",
                        ownerName: restaurant.ownerName || "N/A",
                        ownerPhone: restaurant.ownerPhone || "N/A",
                        zone: restaurant.zone || "N/A",
                        status: restaurant.status === "approved" || restaurant.isActive === true,
                        rating: restaurant.rating || 0,
                        logo: getPrimaryRestaurantImage(restaurant, "https://via.placeholder.com/40"),
                        categories: Array.isArray(restaurant.categories) ? restaurant.categories : [],
                        categoryIds: Array.isArray(restaurant.categoryIds) ? restaurant.categoryIds : [],
                        primaryCategoryId: restaurant.primaryCategoryId || null,
                        diningSettings: restaurant.diningSettings || { isEnabled: false, maxGuests: 6, diningType: "" },
                        originalData: restaurant,
                    }))

                    setRestaurants(mappedRestaurants)
                } else {
                    if (isInitialLoad) setRestaurants([])
                }
            } catch (err) {
                debugError("Error fetching restaurants:", err)
                if (isInitialLoad) {
                    setError(err.message || "Failed to fetch restaurants")
                    setRestaurants([])
                }
            } finally {
                if (isInitialLoad) {
                    setLoading(false)
                    isInitialLoad = false;
                }
            }
        }

        fetchRestaurants()
        
        // Setup polling for real-time reflection
        const intervalId = setInterval(() => {
            fetchRestaurants()
        }, 3000)
        
        return () => clearInterval(intervalId)
    }, [])

    // Fetch categories
    useEffect(() => {
        const fetchCategories = async () => {
            try {
                setCategoryLoading(true)
                const response = await adminAPI.getDiningCategories()
                if (response.data && response.data.success) {
                    const cats = (response.data.data.categories || []).map(cat => ({
                        ...cat,
                        slug: cat.name.toLowerCase().replace(/\s+/g, '-')
                    }))
                    setCategories(cats)
                }
            } catch (err) {
                debugError("Error fetching categories:", err)
            } finally {
                setCategoryLoading(false)
            }
        }
        fetchCategories()
    }, [])

    const filteredRestaurants = useMemo(() => {
        let result = [...restaurants]

        // Search Filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim()
            result = result.filter(restaurant =>
                restaurant.name.toLowerCase().includes(query) ||
                restaurant.ownerName.toLowerCase().includes(query) ||
                restaurant.ownerPhone.includes(query)
            )
        }

        // Category Filter
        if (selectedCategory !== "All") {
            result = result.filter(restaurant =>
                restaurant.categories?.some(category => category.slug === selectedCategory) ||
                (selectedCategory === "Uncategorized" && !restaurant.diningSettings?.diningType)
            )
        }

        return result
    }, [restaurants, searchQuery, selectedCategory])

    const formatRestaurantId = (id) => {
        if (!id) return "REST000000"
        return `REST${String(id).slice(-6).toUpperCase()}`
    }

    const renderStars = (rating) => {
        const fullStars = Math.floor(rating || 0);
        return (
            <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                    <Star 
                        key={i} 
                        className={`w-3.5 h-3.5 ${i < fullStars ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`} 
                    />
                ))}
                <span className="ml-1 text-slate-600">({rating || 0})</span>
            </div>
        )
    }

    const handleDiningToggle = async (restaurant) => {
        const newStatus = !restaurant.diningSettings?.isEnabled
        try {
            // Optimistic update
            setRestaurants(prev => prev.map(r =>
                r.id === restaurant.id
                    ? { ...r, diningSettings: { ...r.diningSettings, isEnabled: newStatus } }
                    : r
            ))

            await adminAPI.updateRestaurantDiningSettings(restaurant._id, {
                isEnabled: newStatus,
                maxGuests: restaurant.diningSettings?.maxGuests || 6,
                categoryIds: restaurant.categoryIds || [],
                primaryCategoryId: restaurant.primaryCategoryId || restaurant.categoryIds?.[0] || null,
            })
            // Could show success toast here
        } catch (error) {
            debugError("Failed to update dining settings", error)
            // Revert on error
            setRestaurants(prev => prev.map(r =>
                r.id === restaurant.id
                    ? { ...r, diningSettings: { ...r.diningSettings, isEnabled: !newStatus } }
                    : r
            ))
        }
    }

    const handleMaxGuestsUpdate = async (restaurant, newValue) => {
        const guests = parseInt(newValue)
        if (isNaN(guests) || guests < 1) return

        // Prevent unnecessary API calls
        if (guests === restaurant.diningSettings?.maxGuests) return

        try {
            // Optimistic update
            setRestaurants(prev => prev.map(r =>
                r.id === restaurant.id
                    ? { ...r, diningSettings: { ...r.diningSettings, maxGuests: guests } }
                    : r
            ))

            await adminAPI.updateRestaurantDiningSettings(restaurant._id, {
                isEnabled: restaurant.diningSettings?.isEnabled === true,
                maxGuests: guests,
                commissionPct: restaurant.diningSettings?.commissionPct ?? 10,
                categoryIds: restaurant.categoryIds || [],
                primaryCategoryId: restaurant.primaryCategoryId || restaurant.categoryIds?.[0] || null,
            })
        } catch (error) {
            debugError("Failed to update max guests", error)
            // Revert would require tracking previous value better
        }
    }

    const handleCommissionPctUpdate = async (restaurant, newValue) => {
        const pct = parseInt(newValue)
        if (isNaN(pct) || pct < 0 || pct > 100) return

        if (pct === (restaurant.diningSettings?.commissionPct ?? 10)) return

        try {
            // Optimistic update
            setRestaurants(prev => prev.map(r =>
                r.id === restaurant.id
                    ? { ...r, diningSettings: { ...r.diningSettings, commissionPct: pct } }
                    : r
            ))

            await adminAPI.updateRestaurantDiningSettings(restaurant._id, {
                isEnabled: restaurant.diningSettings?.isEnabled === true,
                maxGuests: restaurant.diningSettings?.maxGuests || 6,
                commissionPct: pct,
                categoryIds: restaurant.categoryIds || [],
                primaryCategoryId: restaurant.primaryCategoryId || restaurant.categoryIds?.[0] || null,
            })
        } catch (error) {
            debugError("Failed to update commission percentage", error)
        }
    }

    return (
        <div className="h-full overflow-y-auto bg-slate-50 p-4 lg:p-6">
            <div className="max-w-7xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-slate-900">Dining Management</h1>
                        </div>
                    </div>
                    <p className="text-slate-500 mb-6">Manage restaurants available for dining and track platform commissions.</p>
                    
                    {/* Tab Navigation Switcher */}
                    <div className="flex border-b border-slate-200">
                        <button
                            onClick={() => setActiveTab("restaurants")}
                            className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors ${
                                activeTab === "restaurants"
                                    ? "border-indigo-600 text-indigo-600"
                                    : "border-transparent text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            Registered Restaurants
                        </button>
                        <button
                            onClick={() => setActiveTab("ledger")}
                            className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors ${
                                activeTab === "ledger"
                                    ? "border-indigo-600 text-indigo-600"
                                    : "border-transparent text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            Commissions Ledger
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    {activeTab === "restaurants" ? (
                        loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                            <span className="ml-3 text-slate-600">Loading dining list...</span>
                        </div>
                    ) : restaurants.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                                <Building2 className="w-10 h-10 text-slate-300" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 mb-2">No dining restaurants added yet</h2>
                            <p className="text-slate-500 max-w-sm mb-8">
                                Get started by adding your first restaurant to the dining management system.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                                <h2 className="text-xl font-bold text-slate-900">Registered Dining Restaurants</h2>

                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="relative flex-1 sm:flex-initial min-w-[250px]">
                                        <input
                                            type="text"
                                            placeholder="Search dining restaurants..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    </div>
                                </div>
                            </div>

                            {/* Category Filter Chips */}
                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-4 mb-2">
                                <button
                                    onClick={() => setSelectedCategory("All")}
                                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${selectedCategory === "All"
                                        ? "bg-blue-600 text-white shadow-md"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                        }`}
                                >
                                    All ({restaurants.length})
                                </button>
                                {categories.map((cat) => {
                                    const count = restaurants.filter(r => r.categories?.some(category => category.slug === cat.slug)).length;
                                    return (
                                        <button
                                            key={cat._id}
                                            onClick={() => setSelectedCategory(cat.slug)}
                                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${selectedCategory === cat.slug
                                                ? "bg-blue-600 text-white shadow-md"
                                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                }`}
                                        >
                                            {cat.name} ({count})
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Owner</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Zone</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Dining</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Guests</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Commission (%)</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Rating</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-100">
                                        {filteredRestaurants.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} className="px-6 py-20 text-center">
                                                    <div className="flex flex-col items-center justify-center">
                                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                                            <Search className="w-8 h-8 text-slate-300" />
                                                        </div>
                                                        <p className="text-lg font-semibold text-slate-700 mb-1">No dining restaurants found</p>
                                                        <p className="text-sm text-slate-500">
                                                            Try adjusting your search query or filters.
                                                        </p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredRestaurants.map((restaurant, index) => (
                                                <tr key={restaurant.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex-shrink-0">
                                                                <img
                                                                    src={restaurant.logo}
                                                                    alt={restaurant.name}
                                                                    className="w-full h-full object-cover"
                                                                    onError={(e) => { e.target.src = "https://via.placeholder.com/40" }}
                                                                />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-medium text-slate-900">{restaurant.name}</span>
                                                                <span className="text-xs text-slate-500">#{formatRestaurantId(restaurant.originalData?.restaurantId || restaurant._id)}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium text-slate-900">{restaurant.ownerName}</span>
                                                            <span className="text-xs text-slate-500">{restaurant.ownerPhone}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="text-sm text-slate-700">{restaurant.zone}</span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <button
                                                            onClick={() => handleDiningToggle(restaurant)}
                                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${restaurant.diningSettings?.isEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                                                        >
                                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${restaurant.diningSettings?.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="100"
                                                                defaultValue={restaurant.diningSettings?.maxGuests || 6}
                                                                onBlur={(e) => handleMaxGuestsUpdate(restaurant, e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.currentTarget.blur()
                                                                    }
                                                                }}
                                                                className="w-16 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500 text-center"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                defaultValue={restaurant.diningSettings?.commissionPct ?? 10}
                                                                onBlur={(e) => handleCommissionPctUpdate(restaurant, e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.currentTarget.blur()
                                                                    }
                                                                }}
                                                                className="w-16 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500 text-center"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="text-sm text-yellow-500 font-medium">{renderStars(restaurant.rating)}</span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${restaurant.status ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                                            {restaurant.status ? "Active" : "Inactive"}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button
                                                            onClick={() => {
                                                                setEditingRestaurant({ ...restaurant })
                                                                setIsEditModalOpen(true)
                                                            }}
                                                            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                                                        >
                                                            <Settings className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )
                ) : (
                    <div>
                        {/* Stats Overview cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-100 flex flex-col justify-between h-36 border border-indigo-400/20">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-100">Total Platform Earnings</span>
                                    <TrendingUp className="w-5 h-5 text-indigo-200" />
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black">
                                        ₹{bookings
                                            .filter(b => b.billStatus === "paid")
                                            .reduce((sum, b) => sum + (b.commissionAmount ?? Number((b.billAmount * ((b.commissionPct ?? 10) / 100)).toFixed(2))), 0)
                                            .toFixed(2)}
                                    </h3>
                                    <p className="text-[10px] text-indigo-200 mt-1">Admin Net Dining Commission (Default 10%)</p>
                                </div>
                            </div>

                            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between h-36">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Settled Volume</span>
                                    <DollarSign className="w-5 h-5 text-slate-400" />
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black text-slate-800">
                                        ₹{bookings
                                            .filter(b => b.billStatus === "paid")
                                            .reduce((sum, b) => sum + Number(b.billAmount), 0)
                                            .toFixed(2)}
                                    </h3>
                                    <p className="text-[10px] text-slate-400 mt-1">Gross Dining Billing Handled</p>
                                </div>
                            </div>

                            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between h-36">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Paid Checkout Orders</span>
                                    <FileText className="w-5 h-5 text-slate-400" />
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black text-slate-800">
                                        {bookings.filter(b => b.billStatus === "paid").length} Settled
                                    </h3>
                                    <p className="text-[10px] text-slate-400 mt-1">Settle transactions completed via Razorpay</p>
                                </div>
                            </div>
                        </div>

                        {/* Ledger Table */}
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black text-slate-800">Settled Commissions History</h3>
                            <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Live Ledger Feed
                            </span>
                        </div>
                        {bookings.filter(b => b.billStatus === "paid").length === 0 ? (
                            <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <p className="text-sm font-medium text-slate-500">No settled commission payouts tracked yet.</p>
                                <p className="text-xs text-slate-400 mt-1">Complete a test Razorpay checkout from the dining guest bookings to populate.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-6 py-3.5 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Date & Guest</th>
                                            <th className="px-6 py-3.5 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Restaurant</th>
                                            <th className="px-6 py-3.5 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Bill Amount</th>
                                            <th className="px-6 py-3.5 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Comm %</th>
                                            <th className="px-6 py-3.5 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Admin Earnings</th>
                                            <th className="px-6 py-3.5 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Restaurant Payout</th>
                                            <th className="px-6 py-3.5 text-center text-xs font-black text-slate-500 uppercase tracking-wider">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {bookings
                                            .filter(b => b.billStatus === "paid")
                                            .map((b) => {
                                                const commPct = b.commissionPct ?? 10
                                                const commAmt = b.commissionAmount ?? Number((b.billAmount * (commPct / 100)).toFixed(2))
                                                const restAmt = Number((b.billAmount - commAmt).toFixed(2))
                                                return (
                                                    <tr key={b._id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-xs font-bold text-slate-800">{b.date} at {b.time}</div>
                                                            <div className="text-[10px] text-slate-400 mt-0.5">{b.guestName || "Guest"} ({b.guests} guests)</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-xs font-black text-slate-800">{b.restaurant?.name || "Tastizo Restaurant"}</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-xs font-bold text-slate-800">₹{b.billAmount}</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-xs font-black text-indigo-600">{commPct}%</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-xs font-extrabold text-indigo-600 font-mono">₹{commAmt}</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-xs font-extrabold text-emerald-600 font-mono">₹{restAmt}</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                                            <span className="inline-flex px-2.5 py-0.5 text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 rounded-md tracking-wider">
                                                                Settled
                                                            </span>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && editingRestaurant && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-900">Edit Dining Settings</h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                                <Plus className="w-5 h-5 rotate-45 text-slate-500" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Status */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">Dining Status</p>
                                    <p className="text-xs text-slate-500">Enable or disable dining for this restaurant</p>
                                </div>
                                <button
                                    onClick={() => setEditingRestaurant(prev => ({
                                        ...prev,
                                        diningSettings: { ...prev.diningSettings, isEnabled: !prev.diningSettings.isEnabled }
                                    }))}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editingRestaurant.diningSettings?.isEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${editingRestaurant.diningSettings?.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {/* Max Guests */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-900">Maximum Guests</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={editingRestaurant.diningSettings?.maxGuests}
                                    onChange={(e) => setEditingRestaurant(prev => ({
                                        ...prev,
                                        diningSettings: { ...prev.diningSettings, maxGuests: parseInt(e.target.value) || 1 }
                                    }))}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            {/* Category */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-900">Dining Category</label>
                                <select
                                    value={editingRestaurant.primaryCategoryId || editingRestaurant.categoryIds?.[0] || ""}
                                    onChange={(e) => setEditingRestaurant(prev => ({
                                        ...prev,
                                        primaryCategoryId: e.target.value || null,
                                        categoryIds: e.target.value ? [e.target.value] : [],
                                        categories: e.target.value
                                            ? categories.filter(cat => cat._id === e.target.value)
                                            : [],
                                        diningSettings: {
                                            ...prev.diningSettings,
                                            diningType: categories.find(cat => cat._id === e.target.value)?.slug || "",
                                        }
                                    }))}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                >
                                    <option value="">Select a category</option>
                                    {categories.map(cat => (
                                        <option key={cat._id} value={cat._id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Platform Commission (%) */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-900">Platform Commission (%)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={editingRestaurant.diningSettings?.commissionPct ?? 10}
                                    onChange={(e) => setEditingRestaurant(prev => ({
                                        ...prev,
                                        diningSettings: { ...prev.diningSettings, commissionPct: parseInt(e.target.value) ?? 10 }
                                    }))}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-slate-50 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setIsEditModalOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        setLoading(true)
                                        await adminAPI.updateRestaurantDiningSettings(editingRestaurant._id, {
                                            isEnabled: editingRestaurant.diningSettings?.isEnabled === true,
                                            maxGuests: editingRestaurant.diningSettings?.maxGuests || 6,
                                            commissionPct: editingRestaurant.diningSettings?.commissionPct ?? 10,
                                            categoryIds: editingRestaurant.categoryIds || [],
                                            primaryCategoryId: editingRestaurant.primaryCategoryId || editingRestaurant.categoryIds?.[0] || null,
                                        })

                                        // Update local state
                                        setRestaurants(prev => prev.map(r =>
                                            r._id === editingRestaurant._id ? editingRestaurant : r
                                        ))

                                        setIsEditModalOpen(false)
                                        // toast.success("Settings updated")
                                    } catch (err) {
                                        debugError("Update failed", err)
                                    } finally {
                                        setLoading(false)
                                    }
                                }}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

