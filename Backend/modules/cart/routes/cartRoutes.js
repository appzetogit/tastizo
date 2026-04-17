import express from "express";
import { authenticate } from "../../auth/middleware/auth.js";
import {
  getCart,
  mergeGuestCart,
  replaceCart,
} from "../controllers/cartController.js";

const router = express.Router();

router.use(authenticate);

router.get("/", getCart);
router.put("/", replaceCart);
router.post("/merge-guest", mergeGuestCart);

export default router;
