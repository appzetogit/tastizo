import express from "express";
import { reverseGeocode } from "../controllers/location.controller.js";

const router = express.Router();

router.get("/reverse", reverseGeocode);

export default router;
