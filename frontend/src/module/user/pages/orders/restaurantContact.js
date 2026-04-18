export const RESTAURANT_CONTACT_UNAVAILABLE_MESSAGE =
  "Restaurant contact number not available"

export const getRestaurantPhone = (restaurant) => {
  if (!restaurant || typeof restaurant !== "object") return ""

  return (
    restaurant.phone ||
    restaurant.mobile ||
    restaurant.contactNumber ||
    restaurant.primaryContactNumber ||
    restaurant.ownerPhone ||
    ""
  )
}

export const resolveRestaurantPhone = (order, fetchedRestaurant = null) => {
  return (
    getRestaurantPhone(fetchedRestaurant) ||
    getRestaurantPhone(order?.restaurantId) ||
    getRestaurantPhone(order?.restaurant) ||
    order?.restaurantPhone ||
    ""
  )
}

export const normalizeTelPhone = (phone) => {
  const rawPhone = String(phone || "").trim()
  if (!rawPhone) return ""

  const normalized = rawPhone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "")
  const digitCount = normalized.replace(/\D/g, "").length

  if (digitCount < 7 || digitCount > 15) return ""

  return normalized
}
