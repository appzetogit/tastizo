export const DELIVERY_NOTIFICATION_EVENTS = Object.freeze({
  NEW_DELIVERY_REQUEST: "NEW_DELIVERY_REQUEST",
  DELIVERY_REQUEST_EXPIRING_SOON: "DELIVERY_REQUEST_EXPIRING_SOON",
  ORDER_ASSIGNED: "ORDER_ASSIGNED",
  PICKUP_READY: "PICKUP_READY",
  CUSTOMER_LOCATION_UPDATED: "CUSTOMER_LOCATION_UPDATED",
  DELIVERY_DELAYED_WARNING: "DELIVERY_DELAYED_WARNING",
  NEAR_CUSTOMER: "NEAR_CUSTOMER",
  DELIVERY_COMPLETED: "DELIVERY_COMPLETED",
  DELIVERY_CANCELLED: "DELIVERY_CANCELLED",
  COD_COLLECTION_REMINDER: "COD_COLLECTION_REMINDER",
  ONLINE_PAYMENT_CONFIRMED: "ONLINE_PAYMENT_CONFIRMED",
  ADMIN_NOTICE: "ADMIN_NOTICE",
  EARNINGS_UPDATE: "EARNINGS_UPDATE",
});

export const DELIVERY_NOTIFICATION_COPY = Object.freeze({
  [DELIVERY_NOTIFICATION_EVENTS.NEW_DELIVERY_REQUEST]: {
    title: "New Delivery Request Received",
    message: "You have a new delivery request 🆕",
  },
  [DELIVERY_NOTIFICATION_EVENTS.DELIVERY_REQUEST_EXPIRING_SOON]: {
    title: "Delivery Request Expiring Soon",
    message: "Hurry! Delivery request is about to expire ⏳",
  },
  [DELIVERY_NOTIFICATION_EVENTS.ORDER_ASSIGNED]: {
    title: "Order Assigned Successfully",
    message: "Order assigned to you successfully ✅",
  },
  [DELIVERY_NOTIFICATION_EVENTS.PICKUP_READY]: {
    title: "Pickup Ready at Restaurant",
    message: "Order is ready for pickup at restaurant 📦",
  },
  [DELIVERY_NOTIFICATION_EVENTS.CUSTOMER_LOCATION_UPDATED]: {
    title: "Customer Location Updated",
    message: "Customer location has been updated 📍",
  },
  [DELIVERY_NOTIFICATION_EVENTS.DELIVERY_DELAYED_WARNING]: {
    title: "Delivery Delayed Warning",
    message: "You are running late for delivery ⏳",
  },
  [DELIVERY_NOTIFICATION_EVENTS.NEAR_CUSTOMER]: {
    title: "Near Customer Location",
    message: "You are near the customer location 📍",
  },
  [DELIVERY_NOTIFICATION_EVENTS.DELIVERY_COMPLETED]: {
    title: "Delivery Completed",
    message: "Delivery completed successfully 🎉",
  },
  [DELIVERY_NOTIFICATION_EVENTS.DELIVERY_CANCELLED]: {
    title: "Delivery Cancelled",
    message: "This delivery has been cancelled ❌",
  },
  [DELIVERY_NOTIFICATION_EVENTS.COD_COLLECTION_REMINDER]: {
    title: "COD Collection Reminder",
    message: "Collect cash from customer 💰",
  },
  [DELIVERY_NOTIFICATION_EVENTS.ONLINE_PAYMENT_CONFIRMED]: {
    title: "Online Payment Confirmed",
    message: "Payment already completed online 💳",
  },
  [DELIVERY_NOTIFICATION_EVENTS.ADMIN_NOTICE]: {
    title: "Admin Notice",
    message: "You have a new message from admin 📢",
  },
  [DELIVERY_NOTIFICATION_EVENTS.EARNINGS_UPDATE]: {
    title: "Earnings Update",
    message: "Your earnings have been updated 💵",
  },
});
