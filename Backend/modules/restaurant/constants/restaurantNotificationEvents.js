export const RESTAURANT_NOTIFICATION_EVENTS = Object.freeze({
  NEW_ORDER_RECEIVED: "NEW_ORDER_RECEIVED",
  ORDER_CANCELLED_BY_USER: "ORDER_CANCELLED_BY_USER",
  NEW_DINING_BOOKING: "NEW_DINING_BOOKING",
  DINING_BOOKING_CANCELLED: "DINING_BOOKING_CANCELLED",
  DELIVERY_PARTNER_ASSIGNED: "DELIVERY_PARTNER_ASSIGNED",
  DELIVERY_PARTNER_REACHED: "DELIVERY_PARTNER_REACHED",
  DELIVERY_PARTNER_DELAYED: "DELIVERY_PARTNER_DELAYED",
  ORDER_PICKED_UP: "ORDER_PICKED_UP",
  REFUND_INITIATED: "REFUND_INITIATED",
  REFUND_COMPLETED: "REFUND_COMPLETED",
  MENU_ITEM_APPROVED: "MENU_ITEM_APPROVED",
  MENU_ITEM_REJECTED: "MENU_ITEM_REJECTED",
  PAYOUT_UPDATED: "PAYOUT_UPDATED",
  NEW_REVIEW_RECEIVED: "NEW_REVIEW_RECEIVED",
});

export const RESTAURANT_NOTIFICATION_COPY = Object.freeze({
  [RESTAURANT_NOTIFICATION_EVENTS.NEW_ORDER_RECEIVED]: {
    title: "New Order Received",
    message: "You received a new order 🆕",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.ORDER_CANCELLED_BY_USER]: {
    title: "Order Cancelled by User",
    message: "A user cancelled an order ❌",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.NEW_DINING_BOOKING]: {
    title: "New Dining Booking Received",
    message: "You received a new dining booking 🍽️",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.DINING_BOOKING_CANCELLED]: {
    title: "Dining Booking Cancelled",
    message: "A dining booking was cancelled",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.DELIVERY_PARTNER_ASSIGNED]: {
    title: "Delivery Partner Assigned",
    message: "A delivery partner has been assigned 🚴",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.DELIVERY_PARTNER_REACHED]: {
    title: "Delivery Partner Reached Restaurant",
    message: "Delivery partner has reached the restaurant 📍",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.DELIVERY_PARTNER_DELAYED]: {
    title: "Delivery Partner Delayed",
    message: "Delivery partner is delayed ⏳",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.ORDER_PICKED_UP]: {
    title: "Order Picked Up Successfully",
    message: "The order has been picked up successfully 📦",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.REFUND_INITIATED]: {
    title: "Refund Initiated",
    message: "Refund has been initiated for an order 💸",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.REFUND_COMPLETED]: {
    title: "Refund Completed",
    message: "Refund has been completed successfully ✅",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.MENU_ITEM_APPROVED]: {
    title: "Admin Approved Menu Item",
    message: "A menu item has been approved by admin ✅",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.MENU_ITEM_REJECTED]: {
    title: "Admin Rejected Menu Item",
    message: "A menu item has been rejected by admin ❌",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.PAYOUT_UPDATED]: {
    title: "Restaurant Payout Update",
    message: "Your payout has been updated 💰",
  },
  [RESTAURANT_NOTIFICATION_EVENTS.NEW_REVIEW_RECEIVED]: {
    title: "New Review Received",
    message: "You received a new customer review ⭐",
  },
});
