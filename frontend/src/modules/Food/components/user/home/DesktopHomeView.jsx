import React, { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Star, Clock, MapPin, Tag, ChevronRight, Leaf } from "lucide-react";
import OptimizedImage from "@food/components/OptimizedImage";

// Using a simplified image handler for desktop cards
const getRestaurantImage = (restaurant) => {
  if (restaurant?.images?.length > 0) return restaurant.images[0];
  if (restaurant?.image) return restaurant.image;
  if (restaurant?.coverImages?.length > 0) return restaurant.coverImages[0];
  if (restaurant?.coverImage) return restaurant.coverImage;
  return "";
};

export default function DesktopHomeView({
  filteredRestaurants = [],
  finalExploreItems = [],
  displayCategories = [],
  exploreMoreHeading = "Explore More",
  showExploreSkeleton = false,
  showRestaurantSkeleton = false,
  showCategorySkeleton = false,
  openSearch,
  searchValue,
  setSearchValue,
  activeTab,
  setActiveTab,
  festBannerVideoUrl,
  festVideoActive
}) {
  const navigate = useNavigate();

  const categoriesRef = useRef(null);

  const scrollCategories = (direction) => {
    if (categoriesRef.current) {
      const scrollAmount = 400; // Scroll amount in pixels
      categoriesRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth"
      });
    }
  };

  return (
    <div className="hidden md:block w-full min-h-screen bg-gray-50 dark:bg-[#0a0a0a] overflow-x-hidden font-sans pb-20">
      {/* 1. Hero Section with Glassmorphism */}
      <section className="relative w-full h-[500px] mb-16 overflow-hidden rounded-b-[3rem] shadow-2xl shadow-green-900/10 dark:shadow-black/50">
        {/* Background Image / Gradient / Video */}
        <div className="absolute inset-0 z-0 bg-[#3a142c]">
          {festVideoActive && festBannerVideoUrl ? (
            <>
              <video
                src={festBannerVideoUrl}
                className="w-full h-full object-cover opacity-80"
                autoPlay
                muted
                loop
                playsInline
              />
              <div className="absolute inset-0 bg-black/40 z-10" />
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-gradient-to-r from-green-900/90 via-[#3a142c]/80 to-pink-900/90 z-10" />
              <img 
                src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=2070&auto=format&fit=crop" 
                alt="Food background" 
                className="w-full h-full object-cover opacity-60"
              />
            </>
          )}
        </div>

        {/* Hero Content */}
        <div className="relative z-20 h-full flex flex-col items-center justify-center max-w-6xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="text-5xl lg:text-7xl font-extrabold text-white tracking-tight mb-6 drop-shadow-lg">
              Discover the <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">finest</span> food
            </h1>
            <p className="text-xl text-gray-200 font-medium max-w-2xl mx-auto mb-10 drop-shadow-md">
              Order from the best restaurants in your area, delivered fresh and fast to your door.
            </p>
          </motion.div>

          {/* Glassmorphic Search Bar */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="w-full max-w-3xl bg-white/10 dark:bg-black/20 backdrop-blur-md border border-white/20 p-2 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center"
            onClick={openSearch}
          >
            <div className="flex-1 bg-white dark:bg-[#1a1a1a] rounded-full flex items-center px-6 py-4 cursor-text hover:shadow-md transition-shadow group">
              <Search className="text-gray-400 group-hover:text-green-500 transition-colors w-6 h-6 mr-4" />
              <div className="text-gray-400 text-lg flex-1 text-left select-none font-medium">
                Search for restaurants, cuisines, or dishes...
              </div>
            </div>
            <button className="ml-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-4 px-8 rounded-full shadow-lg transform transition hover:scale-105 active:scale-95">
              Find Food
            </button>
          </motion.div>
        </div>

        {/* Decorative Wave/Curve at bottom */}
        <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none z-20 transform translate-y-1">
          <svg className="relative block w-full h-[50px]" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V95.8C59.71,118,130.85,130.6,201.33,126.5,242.49,124.1,283.47,112.5,321.39,56.44Z" className="fill-gray-50 dark:fill-[#0a0a0a]"></path>
          </svg>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 space-y-20">
        
        {/* 2. Sleek Categories Row */}
        <section className="relative mt-8">
          
          <div className="relative group/slider">
            <button 
              onClick={() => scrollCategories("left")}
              className="absolute -left-6 top-[calc(50%-12px)] -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white dark:bg-[#1a1a1a] shadow-[0_8px_20px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-gray-800 flex items-center justify-center hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20 text-gray-600 dark:text-gray-300 transition-all hover:scale-110"
            >
              <ChevronRight className="rotate-180 w-6 h-6" />
            </button>

            <div 
              ref={categoriesRef}
              className="flex overflow-x-auto gap-6 pb-6 pt-2 scrollbar-hide px-2"
            >
            {showCategorySkeleton ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="flex-shrink-0 flex flex-col items-center gap-4">
                  <div className="w-32 h-32 bg-white dark:bg-[#1a1a1a] rounded-full animate-pulse shadow-sm" />
                  <div className="w-20 h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                </div>
              ))
            ) : (
              displayCategories.map((category, index) => (
                <motion.div
                  key={category.id || index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  whileHover={{ y: -5 }}
                  className="flex-shrink-0"
                >
                  <Link
                    to={`/user/category/${category.slug}`}
                    className="flex flex-col items-center gap-4 group"
                  >
                    <div className="relative w-32 h-32 rounded-full overflow-hidden bg-white dark:bg-[#1a1a1a] shadow-[0_8px_20px_rgb(0,0,0,0.06)] group-hover:shadow-[0_15px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-gray-800 transition-all duration-300 group-hover:border-green-200 dark:group-hover:border-green-800/50">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10" />
                      <OptimizedImage
                        src={category.image || category.imageUrl}
                        alt={category.name}
                        className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                    <span className="text-base font-bold text-gray-700 dark:text-gray-300 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                      {category.name || category.label}
                    </span>
                  </Link>
                </motion.div>
              ))
            )}
            </div>

            <button 
              onClick={() => scrollCategories("right")}
              className="absolute -right-6 top-[calc(50%-12px)] -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white dark:bg-[#1a1a1a] shadow-[0_8px_20px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-gray-800 flex items-center justify-center hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20 text-gray-600 dark:text-gray-300 transition-all hover:scale-110"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </section>

        {/* Explore More section removed to hide it in desktop view */}

        {/* 4. Featured Restaurants - Spacious Grid */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
                <span className="w-2 h-8 bg-orange-500 rounded-full inline-block"></span>
                Featured Restaurants
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">
                {filteredRestaurants.length} exceptional places delivering to you
              </p>
            </div>
            <div className="hidden lg:flex gap-3">
              <button className="px-5 py-2.5 rounded-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 text-sm font-bold shadow-sm hover:border-green-500 hover:text-green-600 transition-colors">
                Top Rated
              </button>
              <button className="px-5 py-2.5 rounded-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 text-sm font-bold shadow-sm hover:border-green-500 hover:text-green-600 transition-colors">
                Fastest Delivery
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {showRestaurantSkeleton ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="h-80 bg-white dark:bg-[#1a1a1a] rounded-[2rem] animate-pulse" />
              ))
            ) : (
              filteredRestaurants.map((restaurant, index) => {
                const imageUrl = getRestaurantImage(restaurant);
                const isVegOnly = restaurant.isVeg || restaurant.vegOnly;
                
                return (
                  <motion.div
                    key={restaurant.id || index}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.5, delay: (index % 4) * 0.1 }}
                  >
                    <Link
                      to={`/user/restaurants/${restaurant.slug}`}
                      className="group block h-full bg-white dark:bg-[#121212] rounded-[2rem] p-3 shadow-[0_8px_20px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] dark:shadow-none dark:border dark:border-gray-800 dark:hover:border-green-800/50 transition-all duration-300"
                    >
                      {/* Image Container */}
                      <div className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden mb-4">
                        <OptimizedImage
                          src={imageUrl}
                          alt={restaurant.name}
                          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        {/* Tags */}
                        <div className="absolute top-4 left-4 flex flex-col gap-2">
                          {restaurant.featuredPrice && (
                            <span className="bg-gradient-to-r from-pink-500 to-rose-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              Promoted
                            </span>
                          )}
                          {isVegOnly && (
                            <span className="bg-white/90 backdrop-blur-sm text-green-700 text-xs font-bold px-3 py-1.5 rounded-full shadow flex items-center gap-1 border border-green-200">
                              <Leaf className="w-3 h-3" />
                              Pure Veg
                            </span>
                          )}
                        </div>

                        {/* Hover "View Menu" Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                          <div className="bg-white/20 backdrop-blur-md border border-white/40 text-white font-bold py-3 px-6 rounded-full shadow-2xl transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                            View Menu
                          </div>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="px-2 pb-2">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white line-clamp-1 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                            {restaurant.name}
                          </h3>
                          {restaurant.rating && (
                            <div className="flex items-center gap-1 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-lg">
                              <span className="text-green-700 dark:text-green-400 font-bold text-sm">
                                {Number(restaurant.rating).toFixed(1)}
                              </span>
                              <Star className="w-3.5 h-3.5 text-green-600 dark:text-green-400 fill-green-600 dark:fill-green-400" />
                            </div>
                          )}
                        </div>

                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mb-4 font-medium">
                          {restaurant.cuisines?.join(", ") || "Various Cuisines"}
                        </p>

                        <div className="flex items-center gap-4 text-sm font-semibold text-gray-600 dark:text-gray-300 pt-4 border-t border-gray-100 dark:border-gray-800">
                          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-[#1a1a1a] px-3 py-1.5 rounded-lg">
                            <Clock className="w-4 h-4 text-green-500" />
                            {restaurant.deliveryTime || "30-45"} min
                          </div>
                          {restaurant.distance && (
                            <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-[#1a1a1a] px-3 py-1.5 rounded-lg">
                              <MapPin className="w-4 h-4 text-green-500" />
                              {Number(restaurant.distance).toFixed(1)} km
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
