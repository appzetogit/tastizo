export const USER_NOTIFICATION_EVENTS = Object.freeze({
  ORDER_PLACED: "ORDER_PLACED",
  ORDER_ACCEPTED_BY_RESTAURANT: "ORDER_ACCEPTED_BY_RESTAURANT",
  ORDER_REJECTED: "ORDER_REJECTED",
  ORDER_PREPARING: "ORDER_PREPARING",
  ORDER_READY: "ORDER_READY",
  ORDER_PICKED_BY_DELIVERY_PARTNER: "ORDER_PICKED_BY_DELIVERY_PARTNER",
  ORDER_OUT_FOR_DELIVERY: "ORDER_OUT_FOR_DELIVERY",
  ORDER_DELIVERY_OTP_READY: "ORDER_DELIVERY_OTP_READY",
  DELIVERY_PARTNER_NEARBY: "DELIVERY_PARTNER_NEARBY",
  ORDER_DELIVERED: "ORDER_DELIVERED",
});

export const USER_NOTIFICATION_COPY = Object.freeze({
  [USER_NOTIFICATION_EVENTS.ORDER_PLACED]: {
    title: "Order Placed",
    message: "Your order has been placed successfully.",
  },
  [USER_NOTIFICATION_EVENTS.ORDER_ACCEPTED_BY_RESTAURANT]: {
    title: "Order Accepted by Restaurant",
    message: "Restaurant has accepted your order.",
  },
  [USER_NOTIFICATION_EVENTS.ORDER_REJECTED]: {
    title: "Order Rejected",
    message: "Restaurant rejected your order. Refund initiated.",
  },
  [USER_NOTIFICATION_EVENTS.ORDER_PREPARING]: {
    title: "Order Preparing",
    message: "Your food is being prepared.",
  },
  [USER_NOTIFICATION_EVENTS.ORDER_READY]: {
    title: "Order Ready",
    message: "Your order is ready for pickup.",
  },
  [USER_NOTIFICATION_EVENTS.ORDER_PICKED_BY_DELIVERY_PARTNER]: {
    title: "Picked by Delivery Partner",
    message: "Delivery partner picked up your order.",
  },
  [USER_NOTIFICATION_EVENTS.ORDER_OUT_FOR_DELIVERY]: {
    title: "Out for Delivery",
    message: "Your order is on the way.",
  },
  [USER_NOTIFICATION_EVENTS.ORDER_DELIVERY_OTP_READY]: {
    title: "Your delivery OTP is here",
    message:
      "Order ID: #{ORDER_ID}\nOTP: {OTP}\n\nShare this OTP with the delivery partner only after receiving your prepaid order.",
  },
  [USER_NOTIFICATION_EVENTS.DELIVERY_PARTNER_NEARBY]: {
    title: "Near Your Location",
    message: "Delivery partner is nearby (2-3 min away).",
  },
  [USER_NOTIFICATION_EVENTS.ORDER_DELIVERED]: {
    title: "Order delivered successfully",
    message: "Your prepaid order has been completed successfully.",
  },
});

export const ORDER_STATUS_TO_USER_NOTIFICATION = Object.freeze({
  confirmed: USER_NOTIFICATION_EVENTS.ORDER_PLACED,
  preparing: USER_NOTIFICATION_EVENTS.ORDER_PREPARING,
  ready: USER_NOTIFICATION_EVENTS.ORDER_READY,
  out_for_delivery: USER_NOTIFICATION_EVENTS.ORDER_OUT_FOR_DELIVERY,
  delivered: USER_NOTIFICATION_EVENTS.ORDER_DELIVERED,
});
