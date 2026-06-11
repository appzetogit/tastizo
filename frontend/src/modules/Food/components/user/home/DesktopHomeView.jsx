import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Star, Clock, MapPin, Tag, ChevronRight, Leaf, Bookmark, BadgePercent, Timer } from "lucide-react";
import OptimizedImage from "@food/components/OptimizedImage";
import { Card, CardContent } from "@food/components/ui/card";
import { Button } from "@food/components/ui/button";
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";

const WEBVIEW_SESSION_CACHE_BUSTER = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const RestaurantImageCarousel = React.memo(
  ({
    restaurant,
    priority = false,
    backendOrigin = "",
    className = "h-48 sm:h-56 md:h-60 lg:h-64 xl:h-72",
    roundedClass = "rounded-t-md",
  }) => {
    const webviewSessionKeyRef = useRef(WEBVIEW_SESSION_CACHE_BUSTER);
    const imageElementRef = useRef(null);

    const withCacheBuster = useCallback(
      (url) => {
        if (typeof url !== "string" || !url) return "";
        if (/^data:/i.test(url) || /^blob:/i.test(url)) return url;

        const isRelative = !/^(https?:|\/\/|data:|blob:)/i.test(url.trim());
        const resolvedUrl =
          backendOrigin && isRelative
            ? `${backendOrigin.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`
            : url;

        const hasSignedParams =
          /[?&](X-Amz-|Signature=|Expires=|AWSAccessKeyId=|GoogleAccessId=|token=|sig=|se=|sp=|sv=)/i.test(
            resolvedUrl,
          );
        if (hasSignedParams) return resolvedUrl;

        try {
          const parsed = new URL(resolvedUrl, window.location.origin);
          const currentHost =
            typeof window !== "undefined" ? window.location.hostname : "";
          const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(
            parsed.hostname,
          );
          const isSameHost = currentHost && parsed.hostname === currentHost;

          if (isLocalHost || isSameHost) {
            parsed.searchParams.set("_wv", webviewSessionKeyRef.current);
          }
          return parsed.toString();
        } catch {
          return resolvedUrl;
        }
      },
      [backendOrigin],
    );

    const images = useMemo(() => {
      const sourceImages =
        Array.isArray(restaurant.images) && restaurant.images.length > 0
          ? restaurant.images
          : [restaurant.image];

      const validImages = sourceImages
        .filter((img) => typeof img === "string")
        .map((img) => img.trim())
        .filter(Boolean);

      return validImages.map((img) => withCacheBuster(img));
    }, [restaurant.images, restaurant.image, withCacheBuster]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [loadedBySrc, setLoadedBySrc] = useState({});
    const [, setAttemptedSrcs] = useState({});
    const [showShimmer, setShowShimmer] = useState(true);
    const [lastGoodSrc, setLastGoodSrc] = useState("");
    const touchStartX = useRef(0);
    const isSwiping = useRef(false);

    const safeIndex =
      images.length > 0
        ? ((currentIndex % images.length) + images.length) % images.length
        : 0;
    const renderSrc = images[safeIndex] || lastGoodSrc;

    useEffect(() => {
      setCurrentIndex(0);
      setLoadedBySrc({});
      setAttemptedSrcs({});
      setShowShimmer(images.length > 0);
    }, [restaurant?.id, restaurant?.slug, restaurant?.updatedAt, images]);

    useEffect(() => {
      setLastGoodSrc("");
    }, [restaurant?.id, restaurant?.slug]);

    useEffect(() => {
      if (!renderSrc) return;
      const imgEl = imageElementRef.current;
      if (!imgEl) return;

      setShowShimmer(true);
      const shimmerTimeout = setTimeout(() => {
        setShowShimmer(false);
      }, 2500);

      if (imgEl.complete) {
        if (imgEl.naturalWidth > 0) {
          setLoadedBySrc((prev) =>
            prev[renderSrc] ? prev : { ...prev, [renderSrc]: true },
          );
          setLastGoodSrc(renderSrc);
          setShowShimmer(false);
        } else {
          setAttemptedSrcs((prev) => ({ ...prev, [renderSrc]: true }));
        }
      }
      return () => clearTimeout(shimmerTimeout);
    }, [renderSrc]);

    useEffect(() => {
      if (images.length <= 1) return undefined;

      const autoSlideInterval = window.setInterval(() => {
        if (!isSwiping.current) {
          setCurrentIndex((prev) => (prev + 1) % images.length);
        }
      }, 3000);

      return () => window.clearInterval(autoSlideInterval);
    }, [images.length]);

    const handleTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX;
      isSwiping.current = false;
    };

    const handleTouchMove = (e) => {
      const currentX = e.touches[0].clientX;
      const diff = touchStartX.current - currentX;
      if (Math.abs(diff) > 10) {
        isSwiping.current = true;
      }
    };

    const handleTouchEnd = (e) => {
      if (!isSwiping.current || images.length <= 1) return;
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchStartX.current - touchEndX;
      const minSwipeDistance = 50;
      if (Math.abs(diff) > minSwipeDistance) {
        if (diff > 0) {
          setCurrentIndex((prev) => (prev + 1) % images.length);
        } else {
          setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
        }
      }
    };

    return (
      <div
        className={`relative w-full ${className} ${roundedClass} overflow-hidden bg-gray-100 dark:bg-gray-800`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <OptimizedImage
          ref={imageElementRef}
          src={renderSrc}
          alt={restaurant.name}
          priority={priority}
          className={`w-full h-full object-cover transform scale-100 group-hover:scale-105 transition-transform duration-700 ${
            loadedBySrc[renderSrc] ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => {
            setLoadedBySrc((prev) => ({ ...prev, [renderSrc]: true }));
            setLastGoodSrc(renderSrc);
            setShowShimmer(false);
          }}
        />

        {showShimmer && !loadedBySrc[renderSrc] && (
          <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 animate-shimmer" />
        )}

        {/* Navigation Indicators */}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 px-2 pointer-events-none">
            {images.map((_, idx) => (
              <div
                key={idx}
                className={`h-1 rounded-full transition-all duration-300 ${
                  idx === safeIndex ? "w-4 bg-white shadow-sm" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

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
  festVideoActive,
  
  // Props added for restaurant card functionality
  isFavorite,
  addFavorite,
  setSelectedRestaurantSlug,
  setShowManageCollections,
  setShowToast,
  isOutOfService = false,
  BACKEND_ORIGIN = ""
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
      <section className="relative w-full h-[500px] mb-16 overflow-hidden rounded-none shadow-2xl shadow-green-900/10 dark:shadow-black/50">
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
                const availability = getRestaurantAvailabilityStatus(
                  restaurant,
                  new Date(),
                  { ignoreOperationalStatus: true },
                );
                const favorite = isFavorite ? isFavorite(restaurant.slug) : false;

                const handleToggleFavorite = (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (favorite) {
                    if (setSelectedRestaurantSlug) setSelectedRestaurantSlug(restaurant.slug);
                    if (setShowManageCollections) setShowManageCollections(true);
                  } else {
                    if (addFavorite) {
                      addFavorite({
                        slug: restaurant.slug,
                        name: restaurant.name,
                        cuisine: restaurant.cuisine,
                        rating: restaurant.rating,
                        deliveryTime: restaurant.deliveryTime,
                        distance: restaurant.distance,
                        priceRange: restaurant.priceRange,
                        image: restaurant.image,
                      });
                    }
                    if (setShowToast) {
                      setShowToast(true);
                      setTimeout(() => {
                        setShowToast(false);
                      }, 3000);
                    }
                  }
                };

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
                      className="block h-full group"
                    >
                      <Card
                        className={`overflow-hidden gap-0 cursor-pointer border-0 dark:border-gray-800 bg-white dark:bg-[#1a1a1a] transition-all duration-500 py-0 rounded-[28px] flex flex-col h-full w-full relative shadow-sm hover:shadow-xl ${
                          isOutOfService || !availability.isOpen ? "grayscale opacity-75" : ""
                        }`}
                      >
                        {/* Image Section with Carousel */}
                        <div className="relative">
                          <RestaurantImageCarousel
                            restaurant={restaurant}
                            priority={index < 4}
                            backendOrigin={BACKEND_ORIGIN}
                            className="h-48 sm:h-52 md:h-56 lg:h-60"
                            roundedClass="rounded-t-[28px]"
                          />

                          {/* Featured Dish Badge - Top Left */}
                          <div className="absolute top-4 left-4 flex items-center z-10 transform transition-transform duration-300 group-hover:scale-105">
                            <div className="bg-black/70 backdrop-blur-lg text-white px-4 py-1.5 rounded-full text-[11px] font-medium tracking-tight flex items-center shadow-2xl border border-white/20">
                              {restaurant.featuredDish || "Special Dish"} • ₹
                              {restaurant.featuredPrice || 249}
                            </div>
                          </div>

                          {/* Bookmark Icon - Top Right */}
                          <div className="absolute top-4 right-4 z-10 transform transition-transform duration-300 group-hover:scale-110">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleToggleFavorite}
                              aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                              className={`h-11 w-11 rounded-[20px] shadow-xl flex items-center justify-center transition-all duration-300 ${
                                favorite ? "bg-red-500 text-white hover:bg-red-600" : "bg-white/90 backdrop-blur-sm text-gray-800 hover:bg-white"
                              }`}
                            >
                              <Bookmark className={`h-5 w-5 transition-all duration-300 ${favorite ? "fill-white" : ""}`} />
                            </Button>
                          </div>
                        </div>

                        {/* Content Section */}
                        <div className="transform transition-transform duration-300 group-hover:-translate-y-1 flex-grow flex flex-col">
                          <CardContent className="p-4 sm:p-5 flex flex-col flex-grow">
                            {/* Restaurant Name & Rating */}
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-lg lg:text-xl font-bold text-gray-800 dark:text-gray-200 line-clamp-1 leading-tight tracking-tight transition-colors duration-300 group-hover:text-[#ef4f5f]">
                                  {restaurant.name}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-widest shadow-sm ${
                                      availability.isOpen ? "bg-emerald-500 text-white" : "bg-gray-400 text-white"
                                    }`}
                                  >
                                    {availability.isOpen ? "Open now" : "Offline"}
                                  </span>
                                  {availability.isOpen &&
                                    availability.closingCountdownLabel &&
                                    availability.openingTime &&
                                    availability.closingTime && (
                                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-medium uppercase tracking-wide">
                                        <Timer className="h-3 w-3 flex-shrink-0" strokeWidth={2.5} />
                                        <span>{availability.closingCountdownLabel}</span>
                                      </div>
                                    )}
                                </div>
                              </div>
                              <div
                                className={`flex-shrink-0 ${
                                  Number(restaurant.rating) > 0 ? "bg-[#259539]" : "bg-gray-400"
                                } text-white px-2.5 py-1.5 rounded-2xl flex items-center gap-1 shadow-md transform transition-transform duration-300 group-hover:scale-110`}
                              >
                                <span className="text-xs lg:text-sm font-bold tracking-tight">
                                  {Number(restaurant.rating) > 0 ? Number(restaurant.rating).toFixed(1) : "NEW"}
                                </span>
                                {Number(restaurant.rating) > 0 && (
                                  <Star className="h-3 w-3 fill-white text-white" strokeWidth={0} />
                                )}
                              </div>
                            </div>

                            {/* Cuisines */}
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mb-3 font-medium">
                              {restaurant.cuisines?.join(", ") || "Various Cuisines"}
                            </p>

                            {/* Delivery Time & Distance */}
                            <div className="flex items-center gap-1.5 text-xs lg:text-sm text-gray-500 mb-3 transition-opacity duration-300 opacity-70 group-hover:opacity-100 mt-auto pt-3 border-t border-gray-100 dark:border-gray-800">
                              <Clock className="h-4 w-4 text-gray-500 dark:text-gray-400" strokeWidth={1.5} />
                              <span className="font-semibold dark:text-gray-300 text-gray-700">
                                {restaurant.deliveryTime}
                              </span>
                              <span className="mx-1 text-gray-300">|</span>
                              <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400" strokeWidth={1.5} />
                              <span className="font-semibold dark:text-gray-300 text-gray-700">
                                {restaurant.distance}
                              </span>
                            </div>

                            {/* Offer Badge */}
                            {restaurant.offer && (
                              <div className="flex items-center gap-2 text-xs lg:text-sm transform transition-transform duration-300 group-hover:translate-x-1 border-t border-gray-100 dark:border-gray-800 pt-2 mt-1">
                                <BadgePercent className="h-4 w-4 text-rose-500" strokeWidth={2.5} />
                                <span className="text-rose-600 dark:text-rose-400 font-bold">
                                  {restaurant.offer}
                                </span>
                              </div>
                            )}
                          </CardContent>
                        </div>

                        {/* Border Glow Effect */}
                        <div className="absolute inset-0 rounded-[28px] pointer-events-none z-0 transition-all duration-300 border border-transparent group-hover:border-[#2A9C64]/20 group-hover:shadow-[inset_0_0_0_1px_rgba(42,156,100,0.15)]" />
                      </Card>
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
