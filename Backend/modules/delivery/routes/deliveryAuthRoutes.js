import express from "express";
import {
  sendOTP,
  verifyOTP,
  refreshToken,
  logout,
  getCurrentDelivery,
  registerFcmToken,
  removeFcmToken,
} from "../controllers/deliveryAuthController.js";
import { authenticate } from "../middleware/deliveryAuth.js";
import { validate } from "../../../shared/middleware/validate.js";
import Joi from "joi";

const router = express.Router();

// Validation schemas
const sendOTPSchema = Joi.object({
  phone: Joi.string()
    .pattern(
      /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/,
    )
    .required(),
  purpose: Joi.string()
    .valid("login", "register", "reset-password", "verify-phone")
    .default("login"),
});

const verifyOTPSchema = Joi.object({
  phone: Joi.string()
    .pattern(
      /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/,
    )
    .required(),
  otp: Joi.string().required().length(6),
  purpose: Joi.string()
    .valid("login", "register", "reset-password", "verify-phone")
    .default("login"),
  name: Joi.string().allow(null, "").optional(),
});

const fcmRegisterSchema = Joi.object({
  platform: Joi.string().valid("web", "app", "android", "ios").required(),
  fcmToken: Joi.string().optional(),
  token: Joi.string().optional(),
  deviceType: Joi.string().valid("android", "ios").optional(),
  appType: Joi.string().valid("android", "ios").optional(),
  os: Joi.string().valid("android", "ios").optional(),
}).or("fcmToken", "token");

const fcmDeleteSchema = Joi.object({
  platform: Joi.string().valid("web", "app", "android", "ios").required(),
  deviceType: Joi.string().valid("android", "ios").optional(),
  appType: Joi.string().valid("android", "ios").optional(),
  os: Joi.string().valid("android", "ios").optional(),
});

// Public routes
router.post("/send-otp", validate(sendOTPSchema), sendOTP);
router.post("/verify-otp", validate(verifyOTPSchema), verifyOTP);
router.post("/refresh-token", refreshToken);

// Protected routes (require authentication)
router.post("/logout", authenticate, logout);
router.get("/me", authenticate, getCurrentDelivery);
router.post("/fcm-token", authenticate, validate(fcmRegisterSchema), registerFcmToken);
router.delete("/fcm-token", authenticate, validate(fcmDeleteSchema), removeFcmToken);

export default router;
