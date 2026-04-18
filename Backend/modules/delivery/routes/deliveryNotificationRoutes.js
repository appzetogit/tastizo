import express from "express";
import { authenticate } from "../middleware/deliveryAuth.js";
import {
  getDeliveryNotifications,
  getDeliveryUnreadNotificationCount,
  markAllDeliveryNotificationsRead,
  markDeliveryNotificationRead,
} from "../controllers/deliveryNotificationController.js";

const router = express.Router();

router.use(authenticate);

router.get("/notifications", getDeliveryNotifications);
router.get("/notifications/unread-count", getDeliveryUnreadNotificationCount);
router.patch("/notifications/read-all", markAllDeliveryNotificationsRead);
router.patch("/notifications/:notificationId/read", markDeliveryNotificationRead);

export default router;
